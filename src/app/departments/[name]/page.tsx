import { redirect } from 'next/navigation';
import { auth } from '@/auth/config';
import { CompanyFeed } from '@/components/CompanyFeed';
import { FollowButton } from '@/components/FollowButton';
import { requireEmployee } from '@/lib/identity';
import Link from 'next/link';

export default async function DepartmentPage({ params }: { params: Promise<{ name: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/');
  const { name } = await params;
  const { payload, user } = await requireEmployee();
  let users = await payload.find({ collection: 'users', where: { department: { equals: name } }, limit: 1, overrideAccess: true });
  let deptUser = users.docs[0] as { id: string | number } | undefined;
  if (!deptUser) {
    const created = await payload.create({ collection: 'users', data: { identitySubject: `dept:${name}`, email: `${name.toLowerCase()}@example.com`, name: name, department: name, role: 'employee', active: true }, overrideAccess: true });
    deptUser = created as { id: string | number };
  }
  return (
    <main className="shell">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{name} Department</h1>
        <div className="row" style={{ gap: 8 }}>
          {deptUser && <FollowButton userId={String(deptUser.id)} />}
          <Link className="button-link" href="/">Back to intranet</Link>
        </div>
      </div>
      <CompanyFeed departments={name} />
    </main>
  );
}