import type { CollectionConfig } from 'payload';
export const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: { defaultColumns: ['recipient', 'type', 'read', 'createdAt'] },
  access: {
    read: ({ req }) => !!req.user,
    create: () => true,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
  },
  fields: [
    { name: 'recipient', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true },
    { name: 'type', type: 'select', required: true, options: [{ label: 'Mention', value: 'mention' }, { label: 'Comment', value: 'comment' }, { label: 'Reaction', value: 'reaction' }] },
    { name: 'post', type: 'relationship', relationTo: 'posts', required: true, index: true },
    { name: 'comment', type: 'relationship', relationTo: 'comments' },
    { name: 'message', type: 'text', required: true },
    { name: 'read', type: 'checkbox', defaultValue: false, required: true, index: true },
    { name: 'eventKey', type: 'text', unique: true, index: true },
  ],
  timestamps: true,
};
