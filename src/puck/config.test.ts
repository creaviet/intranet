import { describe, expect, it } from 'vitest';
import { createPuckConfig } from './config';
import type { TemplateSummary } from '@/lib/puck';

function data(title: string) {
  return {
    content: [
      { type: 'Heading', props: { id: 'h1', title } },
      { type: 'TextBlock', props: { id: 't1', text: `${title} body` } },
    ],
    root: { props: {} },
    zones: {},
  };
}

type ComponentShape = {
  label?: string;
  fields?: Record<string, unknown>;
  defaultProps?: Record<string, unknown>;
};

function component(config: ReturnType<typeof createPuckConfig>, name: string): ComponentShape {
  return (config.components as Record<string, ComponentShape>)[name];
}

describe('createPuckConfig', () => {
  it('exposes fixed blocks as shared components without instance fields', () => {
    const config = createPuckConfig([
      { id: 'f1', name: 'Banner', mode: 'fixed', data: data('Banner') },
    ]);
    const fixed = component(config, 'SavedBlock_f1');

    expect(fixed.label).toBe('Fixed: Banner');
    expect(fixed.fields).toEqual({});
  });

  it('exposes template blocks with one editable field per text content prop', () => {
    const template: TemplateSummary = {
      id: 't1',
      name: 'Card',
      mode: 'template',
      data: data('Card'),
    };
    const config = createPuckConfig([template]);
    const instance = component(config, 'TemplateBlock_t1');

    expect(instance.label).toBe('Template: Card');
    expect(instance.fields).toEqual({
      f0: { type: 'text', label: 'Heading 1 · Title' },
      f1: { type: 'textarea', label: 'Text block 1 · Text' },
    });
    expect(instance.defaultProps).toEqual({ f0: 'Card', f1: 'Card body' });
  });
});
