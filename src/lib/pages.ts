import type { Payload } from 'payload';
import type { Data } from '@measured/puck';
import { parsePuckData, isValidSlug } from '@/lib/puck';

export type PublishStatus = 'draft' | 'published';
export type PageKind = 'page' | 'article' | 'layout';

export type PageRecord = {
  id: string | number;
  title: string;
  slug: string;
  draftData?: unknown;
  publishedData?: unknown;
  publishedTitle?: string | null;
  status?: PublishStatus | null;
  kind?: PageKind | null;
  layoutSlug?: string | null;
  showOnFeed?: boolean | null;
  publishedShowOnFeed?: boolean | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  author?: unknown;
};

export type PageVersion = {
  title: string;
  data: Data;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export function normalizeContentTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Case-insensitive title conflict check across all pages and articles. */
export async function findPageByTitle(
  payload: Payload,
  title: string,
  excludeId?: string | number,
): Promise<PageRecord | null> {
  const key = normalizeContentTitle(title);
  const result = await payload.find({
    collection: 'pages',
    pagination: false,
    depth: 0,
    select: { title: true },
    overrideAccess: true,
  });

  return (
    (result.docs as PageRecord[]).find(
      (page) =>
        normalizeContentTitle(page.title) === key && String(page.id) !== String(excludeId ?? ''),
    ) ?? null
  );
}

export async function findPageBySlug(payload: Payload, slug: string): Promise<PageRecord | null> {
  const result = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  });

  return (result.docs[0] as PageRecord | undefined) ?? null;
}

/** The live version employees see. Returns null until the page is published. */
/**
 * `kind` is the editor-facing choice. Legacy documents predate the field, so
 * fall back to the old showOnFeed flag (and finally to "article", which is what
 * those documents effectively were).
 */
export function getPageKind(page: Pick<PageRecord, 'kind' | 'showOnFeed'>): PageKind {
  if (page.kind === 'page' || page.kind === 'article' || page.kind === 'layout') return page.kind;
  if (page.showOnFeed === false) return 'page';
  return 'article';
}

export function getPublishedVersion(page: PageRecord): PageVersion | null {
  if (page.status !== 'published') return null;
  const data = parsePuckData(page.publishedData);
  if (!data) return null;

  return {
    title: page.publishedTitle?.trim() || page.title,
    data,
    publishedAt: page.publishedAt ?? null,
    updatedAt: page.updatedAt ?? null,
  };
}

/** The working copy an editor continues to edit after publishing. */
export function getDraftVersion(page: PageRecord): PageVersion {
  return {
    title: page.title,
    // A page that was only ever published by an older code path still renders.
    data: parsePuckData(page.draftData) ?? parsePuckData(page.publishedData) ?? { content: [], root: { props: {} }, zones: {} },
    publishedAt: page.publishedAt ?? null,
    updatedAt: page.updatedAt ?? null,
  };
}

/**
 * True when the working copy differs from what is currently live, or when the
 * page has never been published. The editor uses this to label the state.
 */
export function hasUnpublishedChanges(page: PageRecord): boolean {
  if (page.status !== 'published' || !page.publishedData) return true;
  if ((page.publishedTitle?.trim() || page.title) !== page.title) return true;
  if ((page.showOnFeed !== false) !== (page.publishedShowOnFeed !== false)) return true;

  return stableStringify(page.draftData) !== stableStringify(page.publishedData);
}

export type FeedPage = { slug: string; title: string; publishedAt: string | null; preview: string; author: { id: string; name: string | null; department: string | null } | null };

export type PageListItem = {
  slug: string;
  title: string;
  kind: PageKind;
  status: PublishStatus;
  updatedAt: string | null;
};

/** Compact list for the editor dashboard. */
export async function findPageList(payload: Payload, limit = 100): Promise<PageListItem[]> {
  const result = await payload.find({
    collection: 'pages',
    sort: '-updatedAt',
    limit,
    depth: 0,
    overrideAccess: true,
  });

  return (result.docs as PageRecord[])
    .map((page) => ({
      slug: typeof page.slug === 'string' ? page.slug : '',
      title: page.title,
      kind: getPageKind(page),
      status: page.status === 'published' ? ('published' as const) : ('draft' as const),
      updatedAt: page.updatedAt ?? null,
    }))
    .filter((page) => isValidSlug(page.slug) && page.title.length > 0);
}

/**
 * Published pages that are opted into the intranet home feed. Uses the
 * publish-time snapshot (`publishedShowOnFeed`), so toggling the setting on a
 * draft does not remove the live page from the feed until it is republished.
 */
export async function findFeedPages(payload: Payload, limit = 12): Promise<FeedPage[]> {
  const result = await payload.find({
    collection: 'pages',
    where: {
      and: [{ status: { equals: 'published' } }, { publishedShowOnFeed: { not_equals: false } }],
    },
    sort: '-publishedAt',
    limit,
    depth: 1,
    overrideAccess: true,
  });

  function extractText(value: unknown): string {
    const out: string[] = [];
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const rec = node as Record<string, unknown>;
      if (typeof rec.text === 'string') out.push(rec.text);
      for (const key of Object.keys(rec)) visit(rec[key]);
    };
    visit(value);
    return out.join(' ').replace(/\\s+/g, ' ').trim();
  }
  return (result.docs as PageRecord[])
    .map((page) => {
      const author = page.author && typeof page.author === 'object' ? (page.author as { id?: string; name?: string | null; department?: string | null }) : null;
      return {
        slug: typeof page.slug === 'string' ? page.slug : '',
        title: page.publishedTitle?.trim() || page.title,
        publishedAt: page.publishedAt ?? null,
        preview: extractText(page.publishedData).slice(0, 240),
        author: author ? { id: String(author.id ?? ''), name: author.name ?? null, department: author.department ?? null } : null,
      };
    })
    .filter((page) => isValidSlug(page.slug) && typeof page.title === 'string' && page.title.length > 0);
}
