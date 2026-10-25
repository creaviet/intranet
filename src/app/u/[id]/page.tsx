import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth/config';
import { getPayload } from 'payload';
import config from '@payload-config';
import { requireEmployee } from '@/lib/identity';
import { FollowButton } from '@/components/FollowButton';

export const dynamic = 'force-dynamic';

export default async function UserProfile({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/');
  const { id } = await params;
  const { payload } = await requireEmployee();
  const user = await payload.findByID({ collection: 'users', id, overrideAccess: true }).catch(() => null);
  if (!user) notFound();
  const u = user as { id: string | number; name?: string | null; email?: string | null; department?: string | null; role?: string | null };
  const posts = await payload.find({ collection: 'posts', where: { author: { equals: id } }, sort: '-createdAt', limit: 20, overrideAccess: true });
  const articles = await payload.find({ collection: 'pages', where: { and: [{ author: { equals: id } }, { kind: { equals: 'article' } }, { status: { equals: 'published' } }] }, sort: '-publishedAt', limit: 20, overrideAccess: true });
  return (
    <main className="shell">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{u.name || 'User'}</h1>
        <div className="row" style={{ gap: 8 }}>
          <FollowButton userId={String(u.id)} />
          <Link className="button-link" href="/">Back to intranet</Link>
        </div>
      </div>
      <section className="panel" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{u.email}</p>
        {u.department && <p className="muted" style={{ margin: 0 }}>{u.department}</p>}
        <p className="muted" style={{ margin: 0 }}>Role: {u.role || 'employee'}</p>
      </section>
      <h2>Posts</h2>
      {posts.docs.length === 0 && <p className="muted">No posts yet.</p>}
      {posts.docs.map((p: Record<string, unknown>) => (
        <article className="panel" key={String(p.id)}>
          <h3 style={{ marginTop: 0 }}>{String(p.title ?? '')}</h3>
          <p className="muted">{new Date(String(p.createdAt)).toLocaleString()}</p>
        </article>
      ))}
      <h2>Articles</h2>
      {articles.docs.length === 0 && <p className="muted">No articles yet.</p>}
      {articles.docs.map((a: Record<string, unknown>) => (
        <article className="panel" key={String(a.id)}>
          <h3 style={{ marginTop: 0 }}><a href={`/p/${a.slug}`}>{String(a.publishedTitle ?? a.title ?? '')}</a></h3>
          <p className="muted">{a.publishedAt ? new Date(String(a.publishedAt)).toLocaleString() : ''}</p>
        </article>
      ))}
    </main>
  );
}