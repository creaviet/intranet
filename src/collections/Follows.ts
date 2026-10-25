import type { CollectionConfig } from 'payload';
export const Follows: CollectionConfig = {
  slug: 'follows',
  admin: { defaultColumns: ['follower', 'followee'] },
  access: { read: () => true, create: () => true, delete: () => true },
  fields: [
    { name: 'follower', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'followee', type: 'relationship', relationTo: 'users', required: true, index: true },
  ],
  timestamps: true,
};