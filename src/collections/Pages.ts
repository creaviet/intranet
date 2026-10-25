import type { Access, CollectionConfig, FieldAccess } from 'payload';

type PayloadUser = { role?: string | null } | null | undefined;

function isEditor(user: PayloadUser): boolean {
  return user?.role === 'editor' || user?.role === 'admin';
}

/**
 * Published pages may be read by everyone. Drafts are only visible to
 * editors/admins so an unfinished page never leaks through Payload's REST or
 * GraphQL API.
 */
const readAccess: Access = ({ req }) => {
  if (isEditor(req.user as PayloadUser)) return true;
  return { status: { equals: 'published' } };
};

const editorOnly: Access = ({ req }) => isEditor(req.user as PayloadUser);

/**
 * Field-level guard: even when a published document is readable, only editors
 * may see the working copy that has not been published yet.
 */
const editorFieldRead: FieldAccess = ({ req }) => isEditor(req.user as PayloadUser);
const editorFieldWrite: FieldAccess = ({ req }) => isEditor(req.user as PayloadUser);

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'slug', 'status', 'publishedAt', 'updatedAt'],
  },
  access: {
    read: readAccess,
    create: editorOnly,
    update: editorOnly,
    delete: editorOnly,
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // Legacy documents predate kind. Do not inject a default on update,
        // otherwise simply unpublishing would silently reclassify them.
        if (operation === 'create' && data.kind !== 'article' && data.kind !== 'page' && data.kind !== 'layout') {
          data.kind = 'page';
        }
        // Keep the legacy feed snapshot fields aligned whenever kind is written
        // through the Payload admin as well as through /api/puck.
        if (data.kind === 'article' || data.kind === 'page') {
          data.showOnFeed = data.kind === 'article';
        }
        if (data.kind === 'layout') {
          data.showOnFeed = false;
        }
        return data;
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'author', type: 'relationship', relationTo: 'users' },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'draftData',
      type: 'json',
      required: true,
      defaultValue: { content: [], root: { props: {} }, zones: {} },
      access: { read: editorFieldRead, create: editorFieldWrite, update: editorFieldWrite },
    },
    {
      name: 'publishedData',
      type: 'json',
      // Snapshot of the last published canvas. Kept separate from draftData so
      // editing a live page never takes the published version offline.
      access: { create: editorFieldWrite, update: editorFieldWrite },
    },
    {
      name: 'publishedTitle',
      type: 'text',
      access: { create: editorFieldWrite, update: editorFieldWrite },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
    {
      name: 'kind',
      type: 'select',
      // Not required at the schema level: legacy rows have no kind and must
      // still be updatable (for example to unpublish or migrate them).
      options: [
        { label: 'Page', value: 'page' },
        { label: 'Article (intranet feed)', value: 'article' },
        { label: 'Layout (master page)', value: 'layout' },
      ],
      admin: { description: 'Articles are listed in the intranet home feed; pages are standalone.' },
    },
    {
      name: 'layoutSlug',
      type: 'text',
      admin: { description: 'Optional slug of a layout (master) page that frames this page.' },
    },
    { name: 'departments', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },
    { name: 'tags', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },
    { name: 'people', type: 'relationship', relationTo: 'users', hasMany: true },
    {
      name: 'showOnFeed',
      type: 'checkbox',
      admin: { description: 'Derived from kind and snapshotted on publish. Prefer changing kind.' },
    },
    {
      name: 'publishedShowOnFeed',
      type: 'checkbox',
      admin: { readOnly: true, description: 'Snapshot of the feed setting at publish time.' },
      access: { create: editorFieldWrite, update: editorFieldWrite },
    },
    { name: 'publishedAt', type: 'date', admin: { readOnly: true } },
  ],
  timestamps: true,
};
