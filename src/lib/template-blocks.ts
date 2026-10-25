import type { Data } from '@measured/puck';

type FieldType = 'text' | 'textarea';
type BaseField = { type?: string; label?: string };
type BaseComponent = { label?: string; fields?: Record<string, BaseField | unknown> };

export type EditableTemplateField = {
  key: string;
  componentId: string;
  componentType: string;
  prop: string;
  label: string;
  type: FieldType;
  defaultValue: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function propLabel(prop: string): string {
  const spaced = prop.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Auto-detect editable content: every text/textarea field of every base
 * component in the template becomes one field on each template instance.
 * Fixed/template blocks nested inside the structure are intentionally skipped;
 * their own mode decides how they render.
 */
export function collectTemplateFields(
  data: Data,
  components: Record<string, BaseComponent>,
): EditableTemplateField[] {
  const fields: EditableTemplateField[] = [];
  const typeCounts = new Map<string, number>();

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;

    const type = value.type;
    const props = value.props;
    if (typeof type === 'string' && isRecord(props) && typeof props.id === 'string') {
      const component = components[type];
      if (component?.fields) {
        const count = (typeCounts.get(type) ?? 0) + 1;
        typeCounts.set(type, count);
        const componentLabel = component.label ?? type;

        for (const [prop, definition] of Object.entries(component.fields)) {
          if (!isRecord(definition)) continue;
          const fieldType = definition.type;
          if (fieldType !== 'text' && fieldType !== 'textarea') continue;

          const current = props[prop];
          fields.push({
            key: `f${fields.length}`,
            componentId: props.id,
            componentType: type,
            prop,
            label: `${componentLabel} ${count} · ${propLabel(prop)}`,
            type: fieldType,
            defaultValue: typeof current === 'string' ? current : '',
          });
        }
      }
    }

    Object.values(value).forEach(visit);
  };

  visit(data);
  return fields;
}

/** Rebuild one template instance from its structure + stored per-instance values. */
export function applyTemplateValues(
  data: Data,
  fields: EditableTemplateField[],
  values: Record<string, unknown>,
): Data {
  const copy = structuredClone(data) as Data;
  const fieldsByComponent = new Map<string, EditableTemplateField[]>();
  for (const field of fields) {
    const list = fieldsByComponent.get(field.componentId) ?? [];
    list.push(field);
    fieldsByComponent.set(field.componentId, list);
  }

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;

    const props = value.props;
    if (isRecord(props) && typeof props.id === 'string') {
      for (const field of fieldsByComponent.get(props.id) ?? []) {
        const next = values[field.key];
        props[field.prop] = typeof next === 'string' ? next : field.defaultValue;
      }
    }
    Object.values(value).forEach(visit);
  };

  visit(copy);
  return copy;
}
