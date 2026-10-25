import { Render, type Config, type SlotComponent } from '@measured/puck';
import { templateComponentName, templateInstanceComponentName, type TemplateSummary } from '@/lib/puck';
import { applyTemplateValues, collectTemplateFields } from '@/lib/template-blocks';


export type IntranetPageProps = {
  Heading: { title: string };
  TextBlock: { text: string };
  LinkCard: { title: string; href: string };

  LinkList: { links: { text: string; url: string }[]; openIn: string };
  Frame: {
    top: SlotComponent;
    left: SlotComponent;
    content: SlotComponent;
    bottom: SlotComponent;
  };
  TwoColumnCard: {
    leftTitle: string;
    leftText: string;
    leftHref: string;
    left: SlotComponent;
    rightTitle: string;
    rightText: string;
    rightHref: string;
    right: SlotComponent;
  };
};

const baseComponents: Config<IntranetPageProps>['components'] = {
  Heading: {
    label: 'Heading',
    fields: { title: { type: 'text' } },
    defaultProps: { title: 'Welcome' },
    render: ({ title }: { title: string }) => <h1>{title}</h1>,
  },
  TextBlock: {
    label: 'Text block',
    fields: { text: { type: 'textarea' } },
    defaultProps: { text: 'Add page content here.' },
    render: ({ text }: { text: string }) => <p>{text}</p>,
  },
  LinkCard: {
    label: 'Link card',
    fields: { title: { type: 'text' }, href: { type: 'text' } },
    defaultProps: { title: 'Useful link', href: '/' },
    render: ({ title, href }: { title: string; href: string }) => <a href={href}>{title}</a>,
  },

  LinkList: {
    label: 'List link',
    fields: {
      links: {
        type: 'array',
        arrayFields: {
          text: { type: 'text' },
          url: { type: 'text' },
        },
        defaultItemProps: { text: 'Link', url: '/' },
        getItemSummary: (item: { text?: string; url?: string }) => item.text || item.url || 'Link',
      },
      openIn: {
        type: 'select',
        options: [
          { label: 'Current page', value: 'current' },
          { label: 'New tab', value: 'newTab' },
          { label: 'New window', value: 'newWindow' },
        ],
      },
    },
    defaultProps: { links: [{ text: 'Link', url: '/' }], openIn: 'current' },
    render: ({ links, openIn }: { links: { text: string; url: string }[]; openIn: string }) => {
      const openLink = (url: string) => {
        if (openIn === 'newTab') {
          window.open(url, '_blank', 'noopener');
        } else if (openIn === 'newWindow') {
          window.open(url, '_blank', 'noopener,width=800,height=600');
        } else {
          window.location.href = url;
        }
      };
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(links || []).map((link, index) => (
            <li key={index} style={{ padding: '4px 0' }}>
              <a
                href={link.url}
                onClick={(e) => {
                  if (openIn !== 'current') {
                    e.preventDefault();
                    openLink(link.url);
                  }
                }}
                target={openIn === 'newTab' ? '_blank' : undefined}
                rel={openIn === 'newTab' ? 'noopener noreferrer' : undefined}
              >
                {link.text || link.url}
              </a>
            </li>
          ))}
        </ul>
      );
    },
  },
  Frame: {
    label: 'Master frame',
    fields: {
      top: { type: 'slot' },
      left: { type: 'slot' },
      content: { type: 'slot' },
      bottom: { type: 'slot' },
    },
    defaultProps: {
      top: [] as unknown as SlotComponent,
      left: [] as unknown as SlotComponent,
      content: [] as unknown as SlotComponent,
      bottom: [] as unknown as SlotComponent,
    },
    render: ({ top, left, content, bottom }: { top: SlotComponent; left: SlotComponent; content: SlotComponent; bottom: SlotComponent }) => {
      const topContent = top({});
      const leftContent = left({});
      const contentContent = content({});
      const bottomContent = bottom({});
      const hasTop = Array.isArray(topContent) ? topContent.length > 0 : !!topContent;
      const hasLeft = Array.isArray(leftContent) ? leftContent.length > 0 : !!leftContent;
      const hasBottom = Array.isArray(bottomContent) ? bottomContent.length > 0 : !!bottomContent;
      const rows = [hasTop ? 'auto' : null, '1fr', hasBottom ? 'auto' : null].filter(Boolean).join(' ');
      const cols = hasLeft ? '220px 1fr' : '1fr';
      return (
        <div style={{ display: 'grid', gridTemplateRows: rows, gridTemplateColumns: cols, gap: 16, minHeight: 400 }}>
          {hasTop && <div style={{ gridColumn: '1 / -1' }}>{topContent}</div>}
          {hasLeft && <div>{leftContent}</div>}
          <main>{contentContent}</main>
          {hasBottom && <div style={{ gridColumn: '1 / -1' }}>{bottomContent}</div>}
        </div>
      );
    },
  },
  TwoColumnCard: {
    label: '2 column card',
    fields: {
      leftTitle: { type: 'text' },
      leftText: { type: 'textarea' },
      leftHref: { type: 'text' },
      left: { type: 'slot' },
      rightTitle: { type: 'text' },
      rightText: { type: 'textarea' },
      rightHref: { type: 'text' },
      right: { type: 'slot' },
    },
    defaultProps: {
      leftTitle: 'Left card',
      leftText: 'Left card content.',
      leftHref: '/',
      left: [] as unknown as SlotComponent,
      rightTitle: 'Right card',
      rightText: 'Right card content.',
      rightHref: '/',
      right: [] as unknown as SlotComponent,
    },
    render: ({
      leftTitle,
      leftText,
      leftHref,
      left,
      rightTitle,
      rightText,
      rightHref,
      right,
    }: {
      leftTitle: string;
      leftText: string;
      leftHref: string;
      left: SlotComponent;
      rightTitle: string;
      rightText: string;
      rightHref: string;
      right: SlotComponent;
    }) => (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <article className="panel">
          <h2 style={{ marginTop: 0 }}>{leftTitle}</h2>
          <p>{leftText}</p>
          {leftHref ? <a href={leftHref}>Open</a> : null}
          <div>{left({})}</div>
        </article>
        <article className="panel">
          <h2 style={{ marginTop: 0 }}>{rightTitle}</h2>
          <p>{rightText}</p>
          {rightHref ? <a href={rightHref}>Open</a> : null}
          <div>{right({})}</div>
        </article>
      </div>
    ),
  },
};

export function createPuckConfig(templates: TemplateSummary[] = []): Config {
  const components: Record<string, unknown> = { ...baseComponents };
  const config = { components } as Config;

  const fixedComponentNames: string[] = [];
  const templateComponentNames: string[] = [];

  for (const template of templates) {
    if (template.mode === 'template') {
      const editableFields = collectTemplateFields(template.data, baseComponents);
      const fields = Object.fromEntries(
        editableFields.map((field) => [
          field.key,
          { type: field.type, label: field.label },
        ]),
      );
      const defaultProps = Object.fromEntries(
        editableFields.map((field) => [field.key, field.defaultValue]),
      );

      const componentName = templateInstanceComponentName(template.id);
      components[componentName] = {
        label: `Template: ${template.name}`,
        fields,
        defaultProps,
        render: (props: Record<string, unknown>) => (
          <Render
            config={config}
            data={applyTemplateValues(template.data, editableFields, props)}
          />
        ),
      };
      templateComponentNames.push(componentName);
      continue;
    }

    const componentName = templateComponentName(template.id);
    components[componentName] = {
      label: `Fixed: ${template.name}`,
      fields: {},
      defaultProps: {},
      render: () => <Render config={config} data={template.data} />,
    };
    fixedComponentNames.push(componentName);
  }

  const categories: Record<string, { title: string; components: string[]; defaultExpanded?: boolean }> = {
    components: {
      title: 'Components',
      components: Object.keys(baseComponents),
      defaultExpanded: true,
    },
  };
  if (fixedComponentNames.length > 0) {
    categories.fixed = {
      title: 'Fixed blocks',
      components: fixedComponentNames,
      defaultExpanded: true,
    };
  }
  if (templateComponentNames.length > 0) {
    categories.template = {
      title: 'Template blocks',
      components: templateComponentNames,
      defaultExpanded: true,
    };
  }

  (config as { categories?: unknown }).categories = categories;
  return config;
}

export const puckConfig = createPuckConfig();
