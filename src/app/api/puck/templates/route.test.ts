import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payload } from 'payload';

const identity = vi.hoisted(() => ({
  requireEditor: vi.fn(),
}));

vi.mock('@/lib/identity', () => identity);

import { GET, POST, PUT } from './route';

function puckData(title: string) {
  return {
    content: [{ type: 'Heading', props: { id: 'heading-1', title } }],
    root: { props: {} },
    zones: {},
  };
}

function blockData(referencedId: string) {
  return {
    content: [{ type: `SavedBlock_${referencedId}`, props: { id: `block-${referencedId}` } }],
    root: { props: {} },
    zones: {},
  };
}

function createStore(initial: Array<Record<string, unknown>> = []) {
  const docs = initial.map((doc) => ({ ...doc }));
  let sequence = 0;

  const find = vi.fn(async ({ where }: { where?: { id?: { equals?: string } } } = {}) => {
    const id = where?.id?.equals;
    return { docs: docs.filter((doc) => id === undefined || String(doc.id) === id).map((doc) => ({ ...doc })) };
  });

  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const doc = { id: `template-${++sequence}`, ...data };
    docs.push(doc);
    return { ...doc };
  });

  const update = vi.fn(async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
    const index = docs.findIndex((doc) => String(doc.id) === String(id));
    if (index < 0) throw new Error('Template not found');
    docs[index] = { ...docs[index], ...data };
    return { ...docs[index] };
  });

  return { docs, payload: { find, create, update } as unknown as Payload, find, create, update };
}

function request(
  method: string,
  body?: unknown,
  origin: string | null = 'http://localhost:3000',
  url = 'http://localhost:3000/api/puck/templates',
) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (origin) headers.set('origin', origin);

  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function useEditor(store: ReturnType<typeof createStore>) {
  identity.requireEditor.mockResolvedValue({ payload: store.payload, user: { role: 'editor' } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/puck/templates', () => {
  it('returns valid reusable blocks', async () => {
    const store = createStore([
      { id: 't1', name: 'Hero', data: puckData('Hello') },
      { id: 't2', name: 'Broken', data: { content: 'nope' } },
    ]);
    useEditor(store);

    const response = await GET(request('GET', undefined, null));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      templates: [{ id: 't1', name: 'Hero', mode: 'fixed', data: puckData('Hello') }],
    });
  });

  it('loads one block by id for editing', async () => {
    const store = createStore([{ id: 't1', name: 'Hero', data: puckData('Hello') }]);
    useEditor(store);

    const response = await GET(
      request('GET', undefined, null, 'http://localhost:3000/api/puck/templates?id=t1'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      template: { id: 't1', name: 'Hero', mode: 'fixed', data: puckData('Hello') },
    });
  });

  it('returns 404 for a missing block', async () => {
    const store = createStore();
    useEditor(store);

    const response = await GET(
      request('GET', undefined, null, 'http://localhost:3000/api/puck/templates?id=missing'),
    );

    expect(response.status).toBe(404);
  });

  it('rejects an invalid block id', async () => {
    const store = createStore();
    useEditor(store);

    const response = await GET(
      request('GET', undefined, null, 'http://localhost:3000/api/puck/templates?id=bad%2Fid'),
    );

    expect(response.status).toBe(400);
  });

  it('requires the editor role', async () => {
    identity.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await GET(request('GET', undefined, null));

    expect(response.status).toBe(403);
  });
});

describe('POST /api/puck/templates', () => {
  it('saves the current canvas as a reusable block', async () => {
    const store = createStore();
    useEditor(store);

    const response = await POST(request('POST', { name: ' Hero block ', data: puckData('Hello') }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      template: { id: 'template-1', name: 'Hero block', mode: 'fixed', data: puckData('Hello') },
    });
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'templates',
        data: { name: 'Hero block', mode: 'fixed', data: puckData('Hello') },
        overrideAccess: true,
      }),
    );
  });

  it('saves a template block', async () => {
    const store = createStore();
    useEditor(store);

    const response = await POST(
      request('POST', { name: 'Card template', mode: 'template', data: puckData('Card') }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      template: { id: 'template-1', name: 'Card template', mode: 'template', data: puckData('Card') },
    });
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Card template', mode: 'template', data: puckData('Card') } }),
    );
  });

  it('rejects a duplicate block name regardless of case', async () => {
    const store = createStore([{ id: 't1', name: 'Hero Block', mode: 'fixed', data: puckData('Old') }]);
    useEditor(store);

    const response = await POST(request('POST', { name: '  hero block ', data: puckData('New') }));

    expect(response.status).toBe(409);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid mode', async () => {
    const store = createStore();
    useEditor(store);

    const response = await POST(
      request('POST', { name: 'Block', mode: 'weird', data: puckData('Hello') }),
    );

    expect(response.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it.each([
    ['missing name', { name: '   ', data: puckData('Hello') }],
    ['invalid data', { name: 'Block', data: { content: 'nope' } }],
    ['empty canvas', { name: 'Block', data: { content: [], root: { props: {} }, zones: {} } }],
  ])('rejects %s', async (_label, payload) => {
    const store = createStore();
    useEditor(store);

    const response = await POST(request('POST', payload));

    expect(response.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects oversized block data', async () => {
    const store = createStore();
    useEditor(store);

    const response = await POST(request('POST', { name: 'Big', data: puckData('x'.repeat(1_000_001)) }));

    expect(response.status).toBe(413);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects cross-origin requests', async () => {
    const store = createStore();
    useEditor(store);

    const response = await POST(
      request('POST', { name: 'Block', data: puckData('Hello') }, 'https://evil.example'),
    );

    expect(response.status).toBe(403);
    expect(identity.requireEditor).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('requires the editor role', async () => {
    const store = createStore();
    identity.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await POST(request('POST', { name: 'Block', data: puckData('Hello') }));

    expect(response.status).toBe(403);
    expect(store.create).not.toHaveBeenCalled();
  });
});

describe('PUT /api/puck/templates', () => {
  it('updates a block name and content', async () => {
    const store = createStore([{ id: 't1', name: 'Old', data: puckData('Old') }]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { id: 't1', name: ' New name ', data: puckData('Updated') }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      template: { id: 't1', name: 'New name', mode: 'fixed', data: puckData('Updated') },
    });
    expect(store.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'templates',
        id: 't1',
        data: { name: 'New name', data: puckData('Updated') },
        overrideAccess: true,
      }),
    );
  });

  it.each([
    ['missing id', { name: 'Block', data: puckData('Hello') }],
    ['invalid id', { id: 'bad/id', name: 'Block', data: puckData('Hello') }],
    ['missing name', { id: 't1', name: '   ', data: puckData('Hello') }],
    ['invalid data', { id: 't1', name: 'Block', data: { content: 'nope' } }],
    ['empty canvas', { id: 't1', name: 'Block', data: { content: [], root: { props: {} }, zones: {} } }],
  ])('rejects %s', async (_label, payload) => {
    const store = createStore([{ id: 't1', name: 'Old', data: puckData('Old') }]);
    useEditor(store);

    const response = await PUT(request('PUT', payload));

    expect(response.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects renaming a block to another existing name', async () => {
    const store = createStore([
      { id: 't1', name: 'One', mode: 'fixed', data: puckData('One') },
      { id: 't2', name: 'Two', mode: 'fixed', data: puckData('Two') },
    ]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { id: 't1', name: ' two ', data: puckData('Updated') }),
    );

    expect(response.status).toBe(409);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('refuses to mutate a template block; it must be saved as a new block', async () => {
    const store = createStore([{ id: 't1', name: 'Card', mode: 'template', data: puckData('Old') }]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { id: 't1', name: 'Card', data: puckData('Updated') }),
    );

    expect(response.status).toBe(409);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing block', async () => {
    const store = createStore();
    useEditor(store);

    const response = await PUT(
      request('PUT', { id: 'missing', name: 'Block', data: puckData('Hello') }),
    );

    expect(response.status).toBe(404);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects direct self-reference', async () => {
    const store = createStore([{ id: 't1', name: 'Self', data: puckData('Old') }]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { id: 't1', name: 'Self', data: blockData('t1') }),
    );

    expect(response.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects an indirect reference cycle', async () => {
    const store = createStore([
      { id: 't1', name: 'One', data: blockData('t2') },
      { id: 't2', name: 'Two', data: puckData('Two') },
    ]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { id: 't2', name: 'Two', data: blockData('t1') }),
    );

    expect(response.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects oversized block data', async () => {
    const store = createStore([{ id: 't1', name: 'Old', data: puckData('Old') }]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { id: 't1', name: 'Big', data: puckData('x'.repeat(1_000_001)) }),
    );

    expect(response.status).toBe(413);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects cross-origin requests', async () => {
    const store = createStore([{ id: 't1', name: 'Old', data: puckData('Old') }]);
    useEditor(store);

    const response = await PUT(
      request('PUT', { id: 't1', name: 'Block', data: puckData('Hello') }, 'https://evil.example'),
    );

    expect(response.status).toBe(403);
    expect(identity.requireEditor).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it('requires the editor role', async () => {
    const store = createStore([{ id: 't1', name: 'Old', data: puckData('Old') }]);
    identity.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await PUT(
      request('PUT', { id: 't1', name: 'Block', data: puckData('Hello') }),
    );

    expect(response.status).toBe(403);
    expect(store.update).not.toHaveBeenCalled();
  });
});
