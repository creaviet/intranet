import type { Payload } from 'payload';
import {
  parsePuckData,
  TEMPLATE_COMPONENT_PREFIXES,
  type TemplateMode,
  type TemplateSummary,
} from '@/lib/puck';
import type { Data } from '@measured/puck';

export type TemplateRecord = {
  id: string | number;
  name: string;
  mode?: TemplateMode | null;
  data?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
};

/** Templates whose JSON still parses; broken rows are skipped instead of crashing a page. */
export function toTemplateSummary(template: TemplateRecord): TemplateSummary | null {
  const data = parsePuckData(template.data);
  if (!data) return null;
  return {
    id: String(template.id),
    name: template.name,
    mode: template.mode === 'template' ? 'template' : 'fixed',
    data,
  };
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Case-insensitive block-name conflict check, excluding the record being edited. */
export async function findTemplateByName(
  payload: Payload,
  name: string,
  excludeId?: string | number,
): Promise<TemplateRecord | null> {
  const key = normalizeName(name);
  const result = await payload.find({
    collection: 'templates',
    pagination: false,
    depth: 0,
    select: { name: true },
    overrideAccess: true,
  });

  return (
    (result.docs as TemplateRecord[]).find(
      (template) =>
        normalizeName(template.name) === key && String(template.id) !== String(excludeId ?? ''),
    ) ?? null
  );
}

/** Look up one block by id without throwing on malformed user input. */
export async function findTemplateById(payload: Payload, id: string): Promise<TemplateRecord | null> {
  const result = await payload.find({
    collection: 'templates',
    where: { id: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return (result.docs[0] as TemplateRecord | undefined) ?? null;
}

/** Collect SavedBlock_* component ids referenced anywhere in a Puck document. */
export function findTemplateReferences(data: Data): Set<string> {
  const references = new Set<string>();

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    if (typeof record.type === 'string') {
      for (const prefix of TEMPLATE_COMPONENT_PREFIXES) {
        if (record.type.startsWith(prefix)) references.add(record.type.slice(prefix.length));
      }
    }
    Object.values(record).forEach(visit);
  };

  visit(data);
  return references;
}

/**
 * Reject a template update that would create a reference cycle (including a
 * block containing itself). Cycles would recurse forever at render time.
 */
export function wouldCreateTemplateCycle(
  templates: TemplateRecord[],
  id: string,
  data: Data,
): boolean {
  const ids = new Set(templates.map((template) => String(template.id)));
  const graph = new Map<string, Set<string>>();

  for (const template of templates) {
    const parsed = parsePuckData(template.data);
    if (!parsed) continue;
    const references = findTemplateReferences(parsed);
    graph.set(
      String(template.id),
      new Set([...references].filter((reference) => ids.has(reference))),
    );
  }
  graph.set(String(id), new Set([...findTemplateReferences(data)].filter((reference) => ids.has(reference))));

  const stack = [...(graph.get(String(id)) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === String(id)) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.get(current) ?? []) stack.push(next);
  }

  return false;
}

/** Only the templates reachable from a page, including nested block references. */
export function selectReferencedTemplates(
  data: Data,
  templates: TemplateSummary[],
): TemplateSummary[] {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const selected = new Map<string, TemplateSummary>();
  const stack = [...findTemplateReferences(data)];

  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (selected.has(id)) continue;
    const template = byId.get(id);
    if (!template) continue;
    selected.set(id, template);
    for (const reference of findTemplateReferences(template.data)) stack.push(reference);
  }

  return templates.filter((template) => selected.has(template.id));
}

export async function findTemplates(payload: Payload): Promise<TemplateRecord[]> {
  const result = await payload.find({
    collection: 'templates',
    limit: 200,
    depth: 0,
    sort: 'name',
    overrideAccess: true,
  });

  return result.docs as TemplateRecord[];
}

export async function findTemplateSummaries(payload: Payload): Promise<TemplateSummary[]> {
  const templates = await findTemplates(payload);
  return templates.map(toTemplateSummary).filter((template): template is TemplateSummary => template !== null);
}
