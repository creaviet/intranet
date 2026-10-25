import { describe, expect, it } from 'vitest';
import { applyTemplateValues, collectTemplateFields } from './template-blocks';

const components = {
  Heading: { label: 'Heading', fields: { title: { type: 'text' } } },
  TextBlock: { label: 'Text block', fields: { text: { type: 'textarea' } } },
  Toggle: { label: 'Toggle', fields: { enabled: { type: 'checkbox' } } },
};

function templateData() {
  return {
    content: [
      { type: 'Heading', props: { id: 'h1', title: 'Default title' } },
      { type: 'TextBlock', props: { id: 't1', text: 'Default text' } },
      { type: 'SavedBlock_fixed', props: { id: 's1', f0: 'Fixed content' } },
    ],
    root: { props: {} },
    zones: {},
  };
}

describe('collectTemplateFields', () => {
  it('collects text and textarea fields from base components', () => {
    const fields = collectTemplateFields(templateData() as never, components);

    expect(fields).toEqual([
      {
        key: 'f0',
        componentId: 'h1',
        componentType: 'Heading',
        prop: 'title',
        label: 'Heading 1 · Title',
        type: 'text',
        defaultValue: 'Default title',
      },
      {
        key: 'f1',
        componentId: 't1',
        componentType: 'TextBlock',
        prop: 'text',
        label: 'Text block 1 · Text',
        type: 'textarea',
        defaultValue: 'Default text',
      },
    ]);
  });

  it('ignores non-text fields and nested saved blocks', () => {
    const fields = collectTemplateFields(templateData() as never, components);
    expect(fields.some((field) => field.componentId === 's1')).toBe(false);

    const toggle = collectTemplateFields(
      {
        content: [{ type: 'Toggle', props: { id: 'x1', enabled: true } }],
        root: { props: {} },
        zones: {},
      } as never,
      components,
    );
    expect(toggle).toEqual([]);
  });
});

describe('applyTemplateValues', () => {
  it('overrides instance values without mutating the template', () => {
    const template = templateData();
    const fields = collectTemplateFields(template as never, components);
    const instance = applyTemplateValues(template as never, fields, {
      f0: 'Instance title',
      f1: 'Instance text',
    });

    expect((instance.content[0] as { props: { title: string } }).props.title).toBe('Instance title');
    expect((instance.content[1] as { props: { text: string } }).props.text).toBe('Instance text');
    expect((template.content[0] as { props: { title: string } }).props.title).toBe('Default title');
  });

  it('uses defaults for missing instance values and preserves unsupported blocks', () => {
    const template = templateData();
    const fields = collectTemplateFields(template as never, components);
    const instance = applyTemplateValues(template as never, fields, {});

    expect((instance.content[0] as { props: { title: string } }).props.title).toBe('Default title');
    expect((instance.content[2] as { props: { f0: string } }).props.f0).toBe('Fixed content');
  });

  it('produces independent content for two instances', () => {
    const template = templateData();
    const fields = collectTemplateFields(template as never, components);
    const first = applyTemplateValues(template as never, fields, { f0: 'First' });
    const second = applyTemplateValues(template as never, fields, { f0: 'Second' });

    expect((first.content[0] as { props: { title: string } }).props.title).toBe('First');
    expect((second.content[0] as { props: { title: string } }).props.title).toBe('Second');
  });
});
