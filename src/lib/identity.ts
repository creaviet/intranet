import { auth } from '@/auth/config';
import { getPayload } from 'payload';
import config from '@payload-config';

export async function requireEmployee() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const subject = session?.user?.id;
  if (!email || !subject) throw new Error('UNAUTHENTICATED');

  const payload = await getPayload({ config });
  const users = await payload.find({
    collection: 'users',
    where: { identitySubject: { equals: subject } },
    limit: 1,
    overrideAccess: true,
  });
  let user = users.docs[0];
  if (!user) {
    // Provisioning is deliberately limited to a verified IdP session.
    user = await payload.create({
      collection: 'users',
      data: { identitySubject: subject, email, name: session?.user?.name || email, avatar: session?.user?.image || '', role: 'employee', active: true },
      overrideAccess: true,
    });
  }
  if (!user.active) throw new Error('FORBIDDEN');
  return { payload, user };
}

/**
 * Publishing and draft access is limited to the editor and admin roles.
 * Keep the check server-side; client buttons are only an affordance.
 */
export async function requireEditor() {
  const context = await requireEmployee();
  if (context.user.role !== 'editor' && context.user.role !== 'admin') {
    throw new Error('FORBIDDEN');
  }
  return context;
}

export function isEditorRole(role: string | null | undefined): boolean {
  return role === 'editor' || role === 'admin';
}

export async function requireAdmin() {
  const context = await requireEmployee();
  if (context.user.role !== 'admin') {
    throw new Error('FORBIDDEN');
  }
  return context;
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin';
}
