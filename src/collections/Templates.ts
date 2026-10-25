import type { Access, CollectionConfig } from 'payload';

type PayloadUser = { role?: string | null } | null | undefined;

function isEditor(user: PayloadUser): boolean {
  return user?.role === 'editor' || user?.role === 'admin';
}

/** Templates are editorial building blocks; employees only see them rendered. */
const editorOnly: Access = ({ req }) => isEditor(req.user as PayloadUser);

export const Templates: CollectionConfig = {
  slug: 'templates',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'mode', 'createdAt', 'updatedAt'],
  },
  access: {
    read: editorOnly,
    create: editorOnly,
    update: editorOnly,
    delete: editorOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 100, index: true },
    {
      name: 'mode',
      type: 'select',
      defaultValue: 'fixed',
      options: [
        { label: 'Fixed block', value: 'fixed' },
        { label: 'Template block', value: 'template' },
      ],
      admin: {
        description:
          'Fixed blocks share one content instance. Template blocks keep their structure fixed and expose editable content fields per page.',
      },
    },
    { name: 'data', type: 'json', required: true },
  ],
  timestamps: true,
};
