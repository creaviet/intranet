import { describe, expect, it, vi } from 'vitest';
import type { Payload } from 'payload';
import {
  findTemplateById,
  findTemplateReferences,
  findTemplateSummaries,
  selectReferencedTemplates,
  findTemplates,
  toTemplateSummary,
  wouldCreateTemplateCycle,
} from './templates';
import { templateComponentName, type TemplateSummary } from './puck';

function puckData(title: string) {
  return {
    content: [{ type: 'Heading', props: { id: 'heading-1', title } }],
    root: { props: {} },
    zones: {},
  };
}

describe('toTemplateSummary', () => {
  it('parses valid template data', () => {
    const summary = toTemplateSummary({ id: 42, name: 'Hero block', data: puckData('Hello') });

    expect(summary).toEqual({ id: '42', name: 'Hero block', mode: 'fixed', data: puckData('Hello') });
  });

  it('returns null for malformed data', () => {
    expect(toTemplateSummary({ id: 't1', name: 'Broken', data: { content: 'nope' } })).toBeNull();
    expect(toTemplateSummary({ id: 't1', name: 'Broken', data: null })).toBeNull();
  });
});

describe('templateComponentName', () => {
  it('creates a safe component key', () => {
    expect(templateComponentName('abc-123')).toBe('SavedBlock_abc-123');
    expect(templateComponentName('bad id/<script>')).toBe('SavedBlock_badidscript');
  });
});

describe('findTemplates', () => {
  it('queries templates by name', async () => {
    const docs = [{ id: 't1', name: 'Hero', data: puckData('Hello') }];
    const find = vi.fn().mockResolvedValue({ docs });
    const payload = { find } as unknown as Payload;

    await expect(findTemplates(payload)).resolves.toBe(docs);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'templates',
        limit: 200,
        depth: 0,
        sort: 'name',
        overrideAccess: true,
      }),
    );
  });
});

describe('findTemplateSummaries', () => {
  it('skips templates whose data cannot be parsed', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [
        { id: 't1', name: 'Good', data: puckData('Hello') },
        { id: 't2', name: 'Broken', data: { content: 'nope' } },
      ],
    });
    const payload = { find } as unknown as Payload;

    await expect(findTemplateSummaries(payload)).resolves.toEqual([
      { id: 't1', name: 'Good', mode: 'fixed', data: puckData('Hello') },
    ]);
  });
});

describe('findTemplateById', () => {
  it('queries one template by id', async () => {
    const doc = { id: 't1', name: 'Hero', data: puckData('Hello') };
    const find = vi.fn().mockResolvedValue({ docs: [doc] });
    const payload = { find } as unknown as Payload;

    await expect(findTemplateById(payload, 't1')).resolves.toBe(doc);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'templates',
        where: { id: { equals: 't1' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      }),
    );
  });

  it('returns null when the template does not exist', async () => {
    const payload = { find: vi.fn().mockResolvedValue({ docs: [] }) } as unknown as Payload;
    await expect(findTemplateById(payload, 'missing')).resolves.toBeNull();
  });
});

describe('findTemplateReferences', () => {
  it('finds saved blocks across nested content and zones', () => {
    const data = {
      content: [
        { type: 'SavedBlock_t1', props: { id: 'a' } },
        {
          type: 'Columns',
          props: {
            id: 'b',
            slot: {
              content: [{ type: 'SavedBlock_t2', props: { id: 'c' } }],
            },
          },
        },
      ],
      root: { props: {} },
      zones: { right: [{ type: 'SavedBlock_t3', props: { id: 'd' } }] },
    };

    expect([...findTemplateReferences(data as never)].sort()).toEqual(['t1', 't2', 't3']);
  });

  it('ignores SavedBlock_ text in ordinary props', () => {
    const data = {
      content: [{ type: 'TextBlock', props: { id: 'a', text: 'SavedBlock_t1' } }],
      root: { props: {} },
      zones: {},
    };

    expect(findTemplateReferences(data as never).size).toBe(0);
  });

  it('collects both fixed and template block references', () => {
    const data = {
      content: [
        { type: 'SavedBlock_fixed1', props: { id: 'a' } },
        { type: 'TemplateBlock_template1', props: { id: 'b' } },
      ],
      root: { props: {} },
      zones: {},
    };

    expect([...findTemplateReferences(data as never)].sort()).toEqual(['fixed1', 'template1']);
  });
});

describe('wouldCreateTemplateCycle', () => {
  it('rejects a block that references itself', () => {
    const data = {
      content: [{ type: 'SavedBlock_t1', props: { id: 'a' } }],
      root: { props: {} },
      zones: {},
    };

    expect(wouldCreateTemplateCycle([{ id: 't1', name: 'One', data: puckData('Old') }], 't1', data as never)).toBe(true);
  });

  it('rejects an indirect cycle', () => {
    const templates = [
      {
        id: 't1',
        name: 'One',
        data: { content: [{ type: 'SavedBlock_t2', props: { id: 'a' } }], root: { props: {} }, zones: {} },
      },
      { id: 't2', name: 'Two', data: puckData('Two') },
    ];
    const proposed = {
      content: [{ type: 'SavedBlock_t1', props: { id: 'b' } }],
      root: { props: {} },
      zones: {},
    };

    expect(wouldCreateTemplateCycle(templates, 't2', proposed as never)).toBe(true);
  });

  it('allows acyclic references and ignores missing ids', () => {
    const templates = [{ id: 't2', name: 'Two', data: puckData('Two') }];
    const proposed = {
      content: [
        { type: 'SavedBlock_t2', props: { id: 'a' } },
        { type: 'SavedBlock_missing', props: { id: 'b' } },
      ],
      root: { props: {} },
      zones: {},
    };

    expect(wouldCreateTemplateCycle(templates, 't1', proposed as never)).toBe(false);
  });
});

describe('selectReferencedTemplates', () => {
  const fixed: TemplateSummary = { id: 'fixed', name: 'Fixed', mode: 'fixed', data: puckData('Fixed') };
  const nested: TemplateSummary = { id: 'nested', name: 'Nested', mode: 'template', data: puckData('Nested') };
  const outer: TemplateSummary = {
    id: 'outer',
    name: 'Outer',
    mode: 'template',
    data: {
      content: [{ type: 'TemplateBlock_nested', props: { id: 'n1' } }],
      root: { props: {} },
      zones: {},
    },
  };
  const unused: TemplateSummary = { id: 'unused', name: 'Unused', mode: 'fixed', data: puckData('Unused') };

  it('returns only blocks reachable from the page, including nested blocks', () => {
    const page = {
      content: [
        { type: 'SavedBlock_fixed', props: { id: 'f1' } },
        { type: 'TemplateBlock_outer', props: { id: 'o1' } },
      ],
      root: { props: {} },
      zones: {},
    };

    const selected = selectReferencedTemplates(page as never, [outer, unused, fixed, nested]);
    expect(selected.map((template) => template.id).sort()).toEqual(['fixed', 'nested', 'outer']);
  });

  it('skips missing references and returns nothing for plain content', () => {
    const page = {
      content: [{ type: 'SavedBlock_missing', props: { id: 'm1' } }],
      root: { props: {} },
      zones: {},
    };
    expect(selectReferencedTemplates(page as never, [fixed])).toEqual([]);
  });
});
