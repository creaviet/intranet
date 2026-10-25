import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payload } from 'payload';

const identity = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  requireEmployee: vi.fn(),
}));

vi.mock('@/lib/identity', () => identity);

import { GET, PATCH, PUT } from './route';

const NOW = '2026-10-25T12:00:00.000Z';

type StoredPage = Record<string, unknown> & { id: string; slug: string };

function puckData(title: string) {
  return {
    content: [{ type: 'Heading', props: { id: 'heading-1', title } }],
    root: { props: {} },
    zones: {},
  };
}

function createStore(initial: StoredPage[] = []) {
  const docs = initial.map((doc) => ({ ...doc }));
  let sequence = 0;

  const find = vi.fn(async ({ where }: { where?: { slug?: { equals?: string } } } = {}) => {
    const slug = where?.slug?.equals;
    return {
      docs: docs
        .filter((doc) => slug === undefined || doc.slug === slug)
        .map((doc) => ({ ...doc })),
    };
  });

  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const doc = { id: `page-${++sequence}`, updatedAt: NOW, ...data } as unknown as StoredPage;
    docs.push(doc);
    return { ...doc };
  });

  const update = vi.fn(async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
    const index = docs.findIndex((doc) => String(doc.id) === String(id));
    if (index < 0) throw new Error('Page not found');
    docs[index] = { ...docs[index], ...data, updatedAt: NOW };
    return { ...docs[index] };
  });

  return { docs, payload: { find, create, update } as unknown as Payload, find, create, update };
}

function request(
  method: string,
  body?: unknown,
  options: { origin?: string | null; url?: string } = {},
) {
  const url = options.url ?? 'http://localhost:3000/api/puck';
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  const origin = options.origin === undefined ? 'http://localhost:3000' : options.origin;
  if (origin) headers.set('origin', origin);

  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function useEditor(store: ReturnType<typeof createStore>) {
  identity.requireEditor.mockResolvedValue({ payload: store.payload, user: { role: 'editor' } });
  identity.requireEmployee.mockResolvedValue({ payload: store.payload, user: { role: 'editor' } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PUT /api/puck', () => {
  it('creates an article draft without publishing it', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PUT(
      request('PUT', { slug: 'welcome', title: 'Welcome', status: 'draft', kind: 'article', data: puckData('Draft heading') }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      slug: 'welcome',
      kind: 'article',
      status: 'draft',
      publishedTitle: null,
      hasUnpublishedChanges: true,
      showOnFeed: true,
    });
    expect(store.docs[0]).toMatchObject({ title: 'Welcome', status: 'draft', kind: 'article', showOnFeed: true });
    expect(store.docs[0].draftData).toEqual(puckData('Draft heading'));
    expect(store.docs[0].publishedData).toBeUndefined();
  });

  it('creates a standalone page by default', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PUT(
      request('PUT', { slug: 'about', title: 'About', status: 'draft', data: puckData('About us') }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ kind: 'page', showOnFeed: false });
    expect(store.docs[0]).toMatchObject({ kind: 'page', showOnFeed: false });
  });

  it('publishes an article and snapshots feed visibility', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PUT(
      request('PUT', { slug: 'welcome', title: 'Welcome', status: 'published', kind: 'article', data: puckData('Live heading') }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      kind: 'article',
      status: 'published',
      publishedTitle: 'Welcome',
      hasUnpublishedChanges: false,
      showOnFeed: true,
    });
    expect(typeof body.publishedAt).toBe('string');
    expect(store.docs[0]).toMatchObject({ status: 'published', kind: 'article', showOnFeed: true, publishedShowOnFeed: true });
    expect(store.docs[0].publishedData).toEqual(puckData('Live heading'));
  });

  it('publishes a standalone page without a feed entry', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PUT(
      request('PUT', { slug: 'about', title: 'About', status: 'published', kind: 'page', data: puckData('About heading') }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ kind: 'page', status: 'published', showOnFeed: false });
    expect(store.docs[0]).toMatchObject({ kind: 'page', status: 'published', showOnFeed: false, publishedShowOnFeed: false });
  });

  it('still accepts the legacy showOnFeed flag', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PUT(
      request('PUT', { slug: 'welcome', title: 'Welcome', status: 'draft', showOnFeed: true, data: puckData('Draft heading') }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ kind: 'article', showOnFeed: true });
    expect(store.docs[0]).toMatchObject({ kind: 'article', showOnFeed: true });
  });

  it('keeps the live snapshot when saving a draft over a published page', async () => {
    const store = createStore([
      {
        id: 'page-1',
        slug: 'welcome',
        title: 'Welcome',
        status: 'published',
        publishedTitle: 'Welcome',
        publishedAt: NOW,
        draftData: puckData('Live heading'),
        publishedData: puckData('Live heading'),
        kind: 'article',
        showOnFeed: true,
        publishedShowOnFeed: true,
        updatedAt: NOW,
      },
    ]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { slug: 'welcome', title: 'Welcome v2', status: 'draft', kind: 'page', data: puckData('Draft heading') }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'published', publishedTitle: 'Welcome', hasUnpublishedChanges: true });

    expect(store.update).toHaveBeenCalledTimes(1);
    expect(store.docs[0]).toMatchObject({
      status: 'published',
      publishedTitle: 'Welcome',
      title: 'Welcome v2',
      kind: 'page',
      showOnFeed: false,
      publishedShowOnFeed: true,
    });
    expect(store.docs[0].draftData).toEqual(puckData('Draft heading'));
    expect(store.docs[0].publishedData).toEqual(puckData('Live heading'));
  });

  it('rejects a title already used by another page or article', async () => {
    const store = createStore([
      { id: 'page-1', slug: 'welcome', title: 'Welcome', status: 'draft', kind: 'article', draftData: puckData('Old') },
    ]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { slug: 'other', title: '  welcome  ', status: 'draft', kind: 'article', data: puckData('New') }),
    );

    expect(response.status).toBe(409);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it('allows an existing page to keep its own title', async () => {
    const store = createStore([
      { id: 'page-1', slug: 'welcome', title: 'Welcome', status: 'draft', kind: 'article', draftData: puckData('Old') },
    ]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { slug: 'welcome', title: 'Welcome', status: 'draft', kind: 'article', data: puckData('New') }),
    );

    expect(response.status).toBe(200);
    expect(store.update).toHaveBeenCalledTimes(1);
  });

  it('updates an existing page instead of creating a duplicate', async () => {
    const store = createStore([
      { id: 'page-1', slug: 'welcome', title: 'Old', status: 'draft', kind: 'page', showOnFeed: false, draftData: puckData('Old') },
    ]);
    useEditor(store);

    await PUT(request('PUT', { slug: 'welcome', title: 'New', status: 'draft', data: puckData('New') }));

    expect(store.docs).toHaveLength(1);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'page-1' }));
  });

  it.each([
    ['invalid slug', { slug: 'Not A Slug', title: 'T', status: 'draft', data: puckData('x') }],
    ['missing title', { slug: 'welcome', title: '   ', status: 'draft', data: puckData('x') }],
    ['invalid status', { slug: 'welcome', title: 'T', status: 'live', data: puckData('x') }],
    ['invalid puck data', { slug: 'welcome', title: 'T', status: 'draft', data: { content: 'nope' } }],
  ])('rejects %s', async (_label, payload) => {
    const store = createStore();
    useEditor(store);

    const response = await PUT(request('PUT', payload));

    expect(response.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects oversized puck data', async () => {
    const store = createStore();
    useEditor(store);
    const data = puckData('x'.repeat(1_000_001));

    const response = await PUT(request('PUT', { slug: 'welcome', title: 'T', status: 'draft', data }));

    expect(response.status).toBe(413);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects cross-origin writes', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PUT(
      request(
        'PUT',
        { slug: 'welcome', title: 'T', status: 'draft', data: puckData('x') },
        { origin: 'https://evil.example' },
      ),
    );

    expect(response.status).toBe(403);
    expect(identity.requireEditor).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('requires the editor role', async () => {
    const store = createStore();
    identity.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await PUT(request('PUT', { slug: 'welcome', title: 'T', status: 'draft', data: puckData('x') }));

    expect(response.status).toBe(403);
    expect(store.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/puck', () => {
  it('returns the published snapshot to employees', async () => {
    const store = createStore([
      {
        id: 'page-1',
        slug: 'welcome',
        title: 'Draft title',
        status: 'published',
        publishedTitle: 'Live title',
        publishedAt: NOW,
        draftData: puckData('Draft heading'),
        publishedData: puckData('Live heading'),
      },
    ]);
    useEditor(store);

    const response = await GET(request('GET', undefined, { url: 'http://localhost:3000/api/puck?slug=welcome' }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ title: 'Live title', kind: 'article', status: 'published', publishedAt: NOW });
    expect(body.data).toEqual(puckData('Live heading'));
    expect(identity.requireEmployee).toHaveBeenCalled();
  });

  it('does not expose a draft-only page as published', async () => {
    const store = createStore([
      { id: 'page-1', slug: 'welcome', title: 'Draft', status: 'draft', draftData: puckData('Draft heading') },
    ]);
    useEditor(store);

    const response = await GET(request('GET', undefined, { url: 'http://localhost:3000/api/puck?slug=welcome' }));

    expect(response.status).toBe(404);
  });

  it('returns the working copy to editors when status=draft', async () => {
    const store = createStore([
      {
        id: 'page-1',
        slug: 'welcome',
        title: 'Draft title',
        status: 'published',
        publishedTitle: 'Live title',
        publishedAt: NOW,
        kind: 'article',
        draftData: puckData('Draft heading'),
        publishedData: puckData('Live heading'),
      },
    ]);
    useEditor(store);

    const response = await GET(
      request('GET', undefined, { url: 'http://localhost:3000/api/puck?slug=welcome&status=draft' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ title: 'Draft title', status: 'published', hasUnpublishedChanges: true });
    expect(body.data).toEqual(puckData('Draft heading'));
    expect(identity.requireEmployee).not.toHaveBeenCalled();
  });

  it('rejects draft reads without the editor role', async () => {
    const store = createStore();
    identity.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await GET(
      request('GET', undefined, { url: 'http://localhost:3000/api/puck?slug=welcome&status=draft' }),
    );

    expect(response.status).toBe(403);
    expect(store.find).not.toHaveBeenCalled();
  });

  it('rejects an invalid slug', async () => {
    const response = await GET(request('GET', undefined, { url: 'http://localhost:3000/api/puck?slug=Bad' }));
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/puck', () => {
  it('unpublishes a page but keeps the draft', async () => {
    const store = createStore([
      {
        id: 'page-1',
        slug: 'welcome',
        title: 'Welcome',
        status: 'published',
        publishedTitle: 'Welcome',
        publishedAt: NOW,
        draftData: puckData('Draft heading'),
        publishedData: puckData('Live heading'),
      },
    ]);
    useEditor(store);

    const response = await PATCH(request('PATCH', { slug: 'welcome' }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'draft', publishedTitle: null, publishedAt: null, hasUnpublishedChanges: true });
    expect(store.docs[0]).toMatchObject({ status: 'draft', publishedData: null, publishedTitle: null, publishedAt: null });
    expect(store.docs[0].draftData).toEqual(puckData('Draft heading'));
  });

  it('returns 404 for an unknown page', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PATCH(request('PATCH', { slug: 'missing' }));

    expect(response.status).toBe(404);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects cross-origin unpublish requests', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PATCH(request('PATCH', { slug: 'welcome' }, { origin: 'https://evil.example' }));

    expect(response.status).toBe(403);
    expect(store.update).not.toHaveBeenCalled();
  });
});
