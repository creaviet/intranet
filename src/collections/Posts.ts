import type { CollectionConfig } from 'payload';
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'author', 'createdAt'] },
  access: {
    read: () => true,
    create: () => true,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'richText', required: true },
    { name: 'author', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'mentions', type: 'relationship', relationTo: 'users', hasMany: true },
    { name: 'departments', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },
    { name: 'tags', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },
    { name: 'pinned', type: 'checkbox', defaultValue: false },
    { name: 'visibility', type: 'select', defaultValue: 'company', options: [{ label: 'Company', value: 'company' }] },
  ],
  timestamps: true,
};
