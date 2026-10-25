import { NextResponse } from 'next/server';
import { requireEditor } from '@/lib/identity';
import { MAX_PUCK_BYTES, parsePuckData, puckDataSize, type TemplateMode } from '@/lib/puck';
import {
  findTemplateById,
  findTemplateByName,
  findTemplates,
  toTemplateSummary,
  wouldCreateTemplateCycle,
} from '@/lib/templates';

class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function errorStatus(error: unknown): number {
  if (error instanceof RequestError) return error.status;
  if (error instanceof Error && error.message === 'FORBIDDEN') return 403;
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') return 401;
  return 500;
}

function errorMessage(error: unknown): string {
  if (error instanceof RequestError) return error.message;
  if (error instanceof Error && error.message === 'FORBIDDEN') return 'Editor role required';
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') return 'Unauthorized';
  console.error('[puck/templates] request failed', error);
  return 'Could not save the reusable block';
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.NEXTAUTH_URL) {
    try {
      allowed.add(new URL(process.env.NEXTAUTH_URL).origin);
    } catch {
      // Ignore malformed public URL here; auth surfaces the real problem.
    }
  }
  if (!allowed.has(origin)) throw new RequestError('Cross-origin request rejected', 403);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RequestError('Invalid JSON body', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError('Invalid request body', 400);
  }
  return body as Record<string, unknown>;
}

function readTemplateId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new RequestError('A valid block id is required', 400);
  }
  return value;
}

function readTemplateMode(value: unknown, fallback: TemplateMode = 'fixed'): TemplateMode {
  if (value === undefined) return fallback;
  if (value === 'fixed' || value === 'template') return value;
  throw new RequestError('mode must be "fixed" or "template"', 400);
}

/**
 * GET /api/puck/templates — list reusable blocks for the editor palette.
 * GET /api/puck/templates?id=... — load one block for editing.
 */
export async function GET(request: Request) {
  try {
    const { payload } = await requireEditor();
    const id = new URL(request.url).searchParams.get('id');

    if (id !== null) {
      const templateId = readTemplateId(id);
      const record = await findTemplateById(payload, templateId);
      if (!record) return noStore({ error: 'Not found' }, 404);
      const template = toTemplateSummary(record);
      if (!template) return noStore({ error: 'Block data is invalid' }, 422);
      return noStore({ template });
    }

    const templates = await findTemplates(payload);
    return noStore({
      templates: templates
        .map(toTemplateSummary)
        .filter((template): template is NonNullable<typeof template> => template !== null),
    });
  } catch (error) {
    return noStore({ error: errorMessage(error) }, errorStatus(error));
  }
}

/** POST /api/puck/templates — save the current canvas as a reusable block. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { payload } = await requireEditor();
    const input = await readJson(request);

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const data = parsePuckData(input.data);
    const mode = readTemplateMode(input.mode);

    if (!name) throw new RequestError('A block name is required', 400);
    if (name.length > 100) throw new RequestError('Block name must be 100 characters or fewer', 400);
    if (!data) throw new RequestError('Invalid Puck data', 400);
    if (puckDataSize(data) > MAX_PUCK_BYTES) throw new RequestError('Block data is too large', 413);
    if (data.content.length === 0) throw new RequestError('Add at least one component before saving a block', 400);
    if (await findTemplateByName(payload, name)) {
      throw new RequestError('A block with this name already exists', 409);
    }

    const saved = await payload.create({
      collection: 'templates',
      data: { name, mode, data },
      overrideAccess: true,
    });
    const template = toTemplateSummary(saved as { id: string | number; name: string; data: unknown });
    if (!template) throw new RequestError('Saved block could not be read back', 500);

    return noStore({ template }, 201);
  } catch (error) {
    return noStore({ error: errorMessage(error) }, errorStatus(error));
  }
}

/** PUT /api/puck/templates — update a reusable block's name and/or content. */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const { payload } = await requireEditor();
    const input = await readJson(request);

    const id = readTemplateId(input.id);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const data = parsePuckData(input.data);

    if (!name) throw new RequestError('A block name is required', 400);
    if (name.length > 100) throw new RequestError('Block name must be 100 characters or fewer', 400);
    if (!data) throw new RequestError('Invalid Puck data', 400);
    if (puckDataSize(data) > MAX_PUCK_BYTES) throw new RequestError('Block data is too large', 413);
    if (data.content.length === 0) throw new RequestError('Add at least one component before saving a block', 400);

    const existing = await findTemplateById(payload, id);
    if (!existing) return noStore({ error: 'Not found' }, 404);
    if (existing.mode === 'template') {
      throw new RequestError(
        'Template blocks are immutable; save the changed structure as a new template block',
        409,
      );
    }
    if (await findTemplateByName(payload, name, existing.id)) {
      throw new RequestError('A block with this name already exists', 409);
    }

    const templates = await findTemplates(payload);
    if (wouldCreateTemplateCycle(templates, id, data)) {
      throw new RequestError('A block cannot contain itself directly or through another block', 400);
    }

    const saved = await payload.update({
      collection: 'templates',
      id: existing.id,
      data: { name, data },
      overrideAccess: true,
    });
    const template = toTemplateSummary(saved as { id: string | number; name: string; data: unknown });
    if (!template) throw new RequestError('Saved block could not be read back', 500);

    return noStore({ template });
  } catch (error) {
    return noStore({ error: errorMessage(error) }, errorStatus(error));
  }
}
