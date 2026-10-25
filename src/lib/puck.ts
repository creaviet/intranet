import type { Data } from '@measured/puck';

/** Upper bound for a serialized Puck document (1 MiB). */
export const MAX_PUCK_BYTES = 1_000_000;

export const DEFAULT_PUCK_DATA: Data = {
  content: [],
  root: { props: {} },
  zones: {},
};

/** Fixed blocks are shared by reference; template blocks expose per-page fields. */
export type TemplateMode = 'fixed' | 'template';

/** A reusable block saved from a page and exposed as a Puck component. */
export type TemplateSummary = {
  id: string;
  name: string;
  mode: TemplateMode;
  data: Data;
};

export function templateComponentName(id: string): string {
  return `SavedBlock_${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export function templateInstanceComponentName(id: string): string {
  return `TemplateBlock_${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export const TEMPLATE_COMPONENT_PREFIXES = ['SavedBlock_', 'TemplateBlock_'] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 && SLUG_PATTERN.test(value);
}

export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Puck data arrives from an untrusted client. Accept only the structural
 * minimum the renderer needs instead of persisting arbitrary JSON.
 */
export function parsePuckData(value: unknown): Data | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.content)) return null;

  const root = candidate.root;
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const props = (root as Record<string, unknown>).props;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return null;

  const zones = candidate.zones ?? {};
  if (typeof zones !== 'object' || Array.isArray(zones)) return null;

  return {
    content: candidate.content,
    root: { props },
    zones,
  } as Data;
}

export function puckDataSize(data: Data): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}
