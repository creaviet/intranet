import { describe, expect, it, vi } from 'vitest';
import type { Payload } from 'payload';
import {
  findFeedPages,
  findPageBySlug,
  findPageByTitle,
  findPageList,
  getDraftVersion,
  getPageKind,
  getPublishedVersion,
  hasUnpublishedChanges,
  type PageRecord,
} from './pages';

function puckData(title: string) {
  return {
    content: [{ type: 'Heading', props: { id: 'heading-1', title } }],
    root: { props: {} },
    zones: {},
  };
}

function makePage(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    id: 'page-1',
    slug: 'welcome',
    title: 'Welcome',
    draftData: puckData('Draft heading'),
    publishedData: puckData('Live heading'),
    publishedTitle: 'Welcome',
    status: 'published',
    publishedAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
    ...overrides,
  };
}

describe('getPageKind', () => {
  it('uses the stored kind', () => {
    expect(getPageKind({ kind: 'page' })).toBe('page');
    expect(getPageKind({ kind: 'article' })).toBe('article');
  });

  it('maps the legacy showOnFeed flag onto a kind', () => {
    expect(getPageKind({ showOnFeed: true })).toBe('article');
    expect(getPageKind({ showOnFeed: false })).toBe('page');
  });

  it('treats legacy documents without either field as articles', () => {
    expect(getPageKind({})).toBe('article');
  });
});

describe('getPublishedVersion', () => {
  it('returns the published snapshot, not the draft', () => {
    const version = getPublishedVersion(makePage());

    expect(version?.title).toBe('Welcome');
    expect(version?.publishedAt).toBe('2026-10-25T10:00:00.000Z');
    expect(version?.data.content[0].props.title).toBe('Live heading');
  });

  it('falls back to the page title when no published title was stored', () => {
    const version = getPublishedVersion(makePage({ publishedTitle: '   ' }));
    expect(version?.title).toBe('Welcome');
  });

  it('returns null when the page is not published', () => {
    expect(getPublishedVersion(makePage({ status: 'draft' }))).toBeNull();
  });

  it('returns null when the published payload is malformed or missing', () => {
    expect(getPublishedVersion(makePage({ publishedData: null }))).toBeNull();
    expect(getPublishedVersion(makePage({ publishedData: { content: 'nope' } }))).toBeNull();
  });
});

describe('getDraftVersion', () => {
  it('returns the working copy for editors', () => {
    const version = getDraftVersion(makePage());
    expect(version.title).toBe('Welcome');
    expect(version.data.content[0].props.title).toBe('Draft heading');
  });

  it('falls back to published data when no draft exists', () => {
    const version = getDraftVersion(makePage({ draftData: null }));
    expect(version.data.content[0].props.title).toBe('Live heading');
  });

  it('returns empty puck data when neither copy is valid', () => {
    const version = getDraftVersion(makePage({ draftData: null, publishedData: 'broken' }));
    expect(version.data.content).toEqual([]);
    expect(version.data.root).toEqual({ props: {} });
    expect(version.data.zones).toEqual({});
  });
});

describe('hasUnpublishedChanges', () => {
  it('is true for a page that has never been published', () => {
    expect(hasUnpublishedChanges(makePage({ status: 'draft', publishedData: null }))).toBe(true);
  });

  it('is false when draft and published snapshots match', () => {
    const data = puckData('Same heading');
    const page = makePage({
      draftData: data,
      publishedData: structuredClone(data),
      publishedTitle: 'Welcome',
    });

    expect(hasUnpublishedChanges(page)).toBe(false);
  });

  it('ignores object key order when comparing snapshots', () => {
    const published = { zones: {}, root: { props: {} }, content: [{ type: 'TextBlock', props: { id: 't1', text: 'Hi' } }] };
    const draft = { content: [{ props: { text: 'Hi', id: 't1' }, type: 'TextBlock' }], root: { props: {} }, zones: {} };

    expect(hasUnpublishedChanges(makePage({ draftData: draft, publishedData: published }))).toBe(false);
  });

  it('detects content changes', () => {
    expect(hasUnpublishedChanges(makePage())).toBe(true);
  });

  it('detects title-only changes', () => {
    const data = puckData('Same heading');
    const page = makePage({ title: 'New title', draftData: data, publishedData: structuredClone(data) });

    expect(hasUnpublishedChanges(page)).toBe(true);
  });

  it('detects feed-visibility changes that are not published yet', () => {
    const data = puckData('Same heading');
    const page = makePage({
      draftData: data,
      publishedData: structuredClone(data),
      showOnFeed: false,
      publishedShowOnFeed: true,
    });

    expect(hasUnpublishedChanges(page)).toBe(true);
  });

  it('ignores feed visibility when draft and published snapshots agree', () => {
    const data = puckData('Same heading');
    const page = makePage({
      draftData: data,
      publishedData: structuredClone(data),
      showOnFeed: false,
      publishedShowOnFeed: false,
    });

    expect(hasUnpublishedChanges(page)).toBe(false);
  });

  it('treats a missing published snapshot as unpublished changes', () => {
    expect(hasUnpublishedChanges(makePage({ publishedData: null }))).toBe(true);
  });
});

describe('findPageBySlug', () => {
  it('queries by slug and returns the first document', async () => {
    const page = makePage();
    const find = vi.fn().mockResolvedValue({ docs: [page] });
    const payload = { find } as unknown as Payload;

    await expect(findPageBySlug(payload, 'welcome')).resolves.toBe(page);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        where: { slug: { equals: 'welcome' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      }),
    );
  });

  it('returns null when no page matches', async () => {
    const payload = { find: vi.fn().mockResolvedValue({ docs: [] }) } as unknown as Payload;
    await expect(findPageBySlug(payload, 'missing')).resolves.toBeNull();
  });
});

describe('findPageList', () => {
  it('returns compact rows sorted by the query and filters invalid documents', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [
        makePage({ slug: 'welcome', title: 'Welcome', kind: 'article', status: 'published' }),
        makePage({ slug: 'about', title: 'About', kind: 'page', status: 'draft' }),
        makePage({ slug: 'Not A Slug', title: 'Bad' }),
        makePage({ slug: 'untitled', title: '' }),
      ],
    });
    const payload = { find } as unknown as Payload;

    await expect(findPageList(payload, 25)).resolves.toEqual([
      {
        slug: 'welcome',
        title: 'Welcome',
        kind: 'article',
        status: 'published',
        updatedAt: '2026-10-25T10:00:00.000Z',
      },
      {
        slug: 'about',
        title: 'About',
        kind: 'page',
        status: 'draft',
        updatedAt: '2026-10-25T10:00:00.000Z',
      },
    ]);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        sort: '-updatedAt',
        limit: 25,
        depth: 0,
        overrideAccess: true,
      }),
    );
  });
});

describe('findPageByTitle', () => {
  it('matches titles case-insensitively and ignores surrounding whitespace', async () => {
    const page = makePage({ id: 'page-1', title: 'Welcome Post' });
    const find = vi.fn().mockResolvedValue({ docs: [page] });
    const payload = { find } as unknown as Payload;

    await expect(findPageByTitle(payload, '  welcome   post ')).resolves.toBe(page);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        pagination: false,
        depth: 0,
        overrideAccess: true,
      }),
    );
  });

  it('excludes the page currently being edited', async () => {
    const page = makePage({ id: 'page-1', title: 'Welcome' });
    const payload = { find: vi.fn().mockResolvedValue({ docs: [page] }) } as unknown as Payload;

    await expect(findPageByTitle(payload, 'Welcome', 'page-1')).resolves.toBeNull();
  });
});

describe('findFeedPages', () => {
  it('returns only valid, published feed entries using the published title', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [
        makePage({ slug: 'welcome', title: 'Draft title', publishedTitle: 'Live title' }),
        makePage({ slug: 'Not A Slug', title: 'Bad slug' }),
        makePage({ slug: 'no-title', title: '', publishedTitle: null }),
      ],
    });
    const payload = { find } as unknown as Payload;

    await expect(findFeedPages(payload, 5)).resolves.toEqual([
      { slug: 'welcome', title: 'Live title', publishedAt: '2026-10-25T10:00:00.000Z', preview: '', author: null },
    ]);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        sort: '-publishedAt',
        limit: 5,
        depth: 1,
        overrideAccess: true,
        where: {
          and: [{ status: { equals: 'published' } }, { publishedShowOnFeed: { not_equals: false } }],
        },
      }),
    );
  });

  it('falls back to the page title when no published title exists', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [makePage({ slug: 'handbook', title: 'Handbook', publishedTitle: null })],
    });
    const payload = { find } as unknown as Payload;

    await expect(findFeedPages(payload)).resolves.toEqual([
      { slug: 'handbook', title: 'Handbook', publishedAt: '2026-10-25T10:00:00.000Z', preview: '', author: null },
    ]);
  });
});
