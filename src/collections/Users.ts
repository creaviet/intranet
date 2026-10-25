import type { CollectionConfig } from 'payload';
export const Users: CollectionConfig = {
  slug: 'users',
  // OIDC is the only login path. `disableLocalStrategy` marks this as Payload's
  // auth collection (required for the Admin UI) without adding email/password
  // fields or a local login route.
  auth: { disableLocalStrategy: true },
  admin: { useAsTitle: 'email' },
  fields: [
    { name: 'identitySubject', type: 'text', unique: true, index: true, required: true },
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'avatar', type: 'text' },
    { name: 'department', type: 'text' },
    { name: 'role', type: 'select', defaultValue: 'employee', options: [{ label: 'Employee', value: 'employee' }, { label: 'Editor', value: 'editor' }, { label: 'Admin', value: 'admin' }] },
    { name: 'active', type: 'checkbox', defaultValue: true, required: true },
  ],
  timestamps: true,
};
