import type { CollectionConfig } from 'payload';
export const Reactions: CollectionConfig = {
  slug: 'reactions',
  admin: { defaultColumns: ['post', 'user', 'emoji'] },
  access: { read: () => true, create: () => true, update: () => false, delete: () => true },
  fields: [
    { name: 'post', type: 'relationship', relationTo: 'posts', index: true },
    { name: 'page', type: 'relationship', relationTo: 'pages', index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'emoji', type: 'select', required: true, options: [{ label: 'Like', value: '👍' }, { label: 'Love', value: '❤️' }, { label: 'Celebrate', value: '🎉' }, { label: 'Support', value: '🙌' }] },
  ],
  timestamps: true,
};
