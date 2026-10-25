import type { CollectionConfig } from 'payload';
export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: { defaultColumns: ['post', 'author', 'createdAt'] },
  access: { read: () => true, create: () => true, update: ({ req }) => !!req.user, delete: ({ req }) => !!req.user },
  fields: [
    { name: 'post', type: 'relationship', relationTo: 'posts', index: true },
    { name: 'page', type: 'relationship', relationTo: 'pages', index: true },
    { name: 'parent', type: 'relationship', relationTo: 'comments' },
    { name: 'author', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'body', type: 'textarea', required: true, maxLength: 5000 },
    { name: 'mentions', type: 'relationship', relationTo: 'users', hasMany: true },
  ],
  timestamps: true,
};
