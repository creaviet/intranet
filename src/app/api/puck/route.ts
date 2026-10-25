import { NextResponse } from 'next/server';
import { requireEditor, requireEmployee } from "@/lib/identity";
import { isValidSlug, MAX_PUCK_BYTES, parsePuckData, puckDataSize } from '@/lib/puck';
import {
  findPageBySlug,
  findPageByTitle,
  getDraftVersion,
  getPageKind,
  getPublishedVersion,
  hasUnpublishedChanges,
  type PageKind,
  type PageRecord,
} from '@/lib/pages';

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
  console.error('[puck] request failed', error);
  return 'Could not save the page';
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Browsers send an Origin header on JSON mutations. Reject cross-site writes
 * even though Auth.js already sets SameSite cookies; a reverse proxy or an
 * older client should not be able to publish on behalf of a signed-in editor.
 */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.NEXTAUTH_URL) {
    try {
      allowed.add(new URL(process.env.NEXTAUTH_URL).origin);
    } catch {
      // Ignore a malformed public URL here; auth fails elsewhere with a clear message.
    }
  }
  if (!allowed.has(origin)) throw new RequestError('Cross-origin request rejected', 403);
}

/** Serialized shape shared by the editor and the read API. Never leaks internals. */
function pageResponse(page: PageRecord) {
  const draft = getDraftVersion(page);
  const kind = getPageKind(page);
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    kind,
    status: page.status === 'published' ? 'published' : 'draft',
    showOnFeed: kind === 'article',
    publishedTitle: page.publishedTitle ?? null,
    publishedAt: page.publishedAt ?? null,
    updatedAt: page.updatedAt ?? null,
    hasUnpublishedChanges: hasUnpublishedChanges(page),
    layoutSlug: page.layoutSlug ?? null,
    data: draft.data,
  };
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

function readSlug(input: Record<string, unknown>): string {
  const slug = input.slug;
  if (!isValidSlug(slug)) throw new RequestError('A valid slug is required', 400);
  return slug;
}

function readTitle(input: Record<string, unknown>): string {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new RequestError('A title is required', 400);
  if (title.length > 200) throw new RequestError('Title must be 200 characters or fewer', 400);
  return title;
}

/**
 * GET /api/puck?slug=welcome[&status=draft]
 *
 * The default returns the live (published) version and is readable by every
 * employee. `status=draft` returns the working copy and requires an editor.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const wantsDraft = url.searchParams.get('status') === 'draft';

  try {
    if (!isValidSlug(slug)) throw new RequestError('A valid slug is required', 400);

    const { payload } = wantsDraft ? await requireEditor() : await requireEmployee();
    const page = await findPageBySlug(payload, slug);
    if (!page) return noStore({ error: 'Not found' }, 404);

    if (wantsDraft) return noStore(pageResponse(page));

    const published = getPublishedVersion(page);
    if (!published) return noStore({ error: 'Not found' }, 404);

    const publishedKind: PageKind = page.publishedShowOnFeed === false ? 'page' : 'article';
    return noStore({
      slug: page.slug,
      title: published.title,
      kind: publishedKind,
      status: 'published',
      showOnFeed: publishedKind === 'article',
      publishedAt: published.publishedAt ?? null,
      layoutSlug: page.layoutSlug ?? null,
      data: published.data,
    });
  } catch (error) {
    return noStore({ error: errorMessage(error) }, errorStatus(error));
  }
}

/**
 * PUT /api/puck
 * Body: { slug, title, data, status: 'draft' | 'published', kind?: 'page' | 'article' }
 *
 * Always saves the working copy. `status: 'published'` additionally replaces
 * the live snapshot. Saving a draft on a published page leaves the live
 * version untouched, so the page stays online while it is being edited.
 *
 * `kind` is the editor-facing content type: articles are listed in the
 * intranet feed, pages are standalone. It maps onto the legacy showOnFeed /
 * publishedShowOnFeed snapshot fields so feed visibility follows publishing.
 */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const { payload, user } = await requireEditor();
    const input = await readJson(request);

    const slug = readSlug(input);
    const title = readTitle(input);
    const status = input.status === 'published' ? 'published' : input.status === 'draft' ? 'draft' : null;
    const data = parsePuckData(input.data);

    if (!status) throw new RequestError('status must be "draft" or "published"', 400);
    if (!data) throw new RequestError('Invalid Puck data', 400);
    if (puckDataSize(data) > MAX_PUCK_BYTES) throw new RequestError('Puck data is too large', 413);

    const existing = await findPageBySlug(payload, slug);
    if (await findPageByTitle(payload, title, existing?.id)) {
      throw new RequestError('A page or article with this title already exists', 409);
    }
    const now = new Date().toISOString();

    // Accept kind (preferred) and the legacy showOnFeed boolean.
    const requestedKind: PageKind | null =
      input.kind === 'page' || input.kind === 'article' || input.kind === 'layout' ? input.kind : null;
    const legacyShowOnFeed = typeof input.showOnFeed === 'boolean' ? input.showOnFeed : null;
    const layoutSlug = typeof input.layoutSlug === 'string' ? input.layoutSlug.trim() : null;
    if (requestedKind === 'layout' && user.role !== 'admin') throw new RequestError('Admin role required', 403);
    // Also protect existing layout pages from non-admin edits.
    if (existing && getPageKind(existing) === 'layout' && user.role !== 'admin') throw new RequestError('Admin role required', 403);
    const fallbackKind: PageKind = existing ? getPageKind(existing) : 'page';
    const kind: PageKind =
      requestedKind ?? (legacyShowOnFeed === null ? fallbackKind : legacyShowOnFeed ? 'article' : 'page');
    const showOnFeed = kind === 'article';

    const draftFields = { title, draftData: data, kind, showOnFeed, layoutSlug: layoutSlug || null };
    const publishFields =
      status === 'published'
        ? { status: 'published', publishedData: data, publishedTitle: title, publishedShowOnFeed: showOnFeed, publishedAt: now }
        : {};

    const updateData: Record<string, unknown> = { ...draftFields, ...publishFields };
    if (!existing?.author) updateData.author = user.id;
    const saved = existing
      ? await payload.update({
          collection: 'pages',
          id: existing.id,
          data: updateData,
          overrideAccess: true,
        })
      : await payload.create({
          collection: 'pages',
          data: { slug, ...draftFields, author: user.id, status: status === 'published' ? 'published' : 'draft', ...publishFields },
          overrideAccess: true,
        });

    return noStore(pageResponse(saved as PageRecord));
  } catch (error) {
    return noStore({ error: errorMessage(error) }, errorStatus(error));
  }
}

/**
 * PATCH /api/puck
 * Body: { slug }
 *
 * Takes a page offline. The working copy is kept, so an editor can publish it
 * again later without losing the content.
 */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { payload } = await requireEditor();
    const input = await readJson(request);
    const slug = readSlug(input);

    const existing = await findPageBySlug(payload, slug);
    if (!existing) return noStore({ error: 'Not found' }, 404);

    const saved = await payload.update({
      collection: 'pages',
      id: existing.id,
      data: { status: 'draft', publishedData: null, publishedTitle: null, publishedAt: null },
      overrideAccess: true,
    });

    return noStore(pageResponse(saved as PageRecord));
  } catch (error) {
    return noStore({ error: errorMessage(error) }, errorStatus(error));
  }
}
