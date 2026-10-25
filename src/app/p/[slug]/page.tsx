import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getPayload } from 'payload';
import config from '@payload-config';
import { auth } from '@/auth/config';
import { requireEditor } from '@/lib/identity';
import { isValidSlug } from '@/lib/puck';
import { findPageBySlug, getDraftVersion, getPublishedVersion } from '@/lib/pages';
import { findTemplateSummaries, selectReferencedTemplates } from '@/lib/templates';
import { PuckRenderer } from '@/components/PuckRenderer';
import { PageComments } from '@/components/PageComments';
import { ReactionBar } from '@/components/ReactionBar';

export const dynamic = 'force-dynamic';

export default async function PublishedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/');

  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const query = await searchParams;
  const previewParam = Array.isArray(query.preview) ? query.preview[0] : query.preview;
  const wantsPreview = previewParam === 'draft';

  let canPreview = false;
  if (wantsPreview) {
    canPreview = await requireEditor()
      .then(() => true)
      .catch(() => false);
    // Do not reveal that a draft exists to non-editors.
    if (!canPreview) notFound();
  }

  const payload = await getPayload({ config });
  const page = await findPageBySlug(payload, slug);
  if (!page) notFound();
  if (page.kind === 'page') redirect(`/${slug}`);

  const version = wantsPreview ? getDraftVersion(page) : getPublishedVersion(page);
  if (!version) notFound();

  // If this page uses a master layout, inject its content into the layout's
  // content slot so the fixed frame (header/sidebar/footer) is preserved.
  let renderData = version.data;
  const layoutSlug = page.layoutSlug;
  if (layoutSlug) {
    const layoutPage = await findPageBySlug(payload, layoutSlug);
    const layoutVersion = layoutPage ? (wantsPreview ? getDraftVersion(layoutPage) : getPublishedVersion(layoutPage)) : null;
    if (layoutVersion) {
      const combined = structuredClone(layoutVersion.data) as typeof layoutVersion.data;
      const inject = (value: unknown): boolean => {
        if (Array.isArray(value)) {
          for (const item of value) if (inject(item)) return true;
          return false;
        }
        if (!value || typeof value !== 'object') return false;
        const record = value as Record<string, unknown>;
        if (record.type === 'Frame' && record.props && typeof record.props === 'object') {
          (record.props as Record<string, unknown>).content = version.data.content;
          return true;
        }
        for (const key of Object.keys(record)) {
          if (inject(record[key])) return true;
        }
        return false;
      };
      if (inject(combined)) renderData = combined;
      // Also pull in templates referenced by the layout.
    }
  }

  const templates = selectReferencedTemplates(renderData, await findTemplateSummaries(payload));

  return (
    <main className="shell">
      {wantsPreview && (
        <p role="status" style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px' }}>
          Draft preview — employees still see the {page.status === 'published' ? 'published' : 'last published'} version until you publish.
        </p>
      )}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{version.title}</h1>
          {page.kind === 'article' && (
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {(() => {
                const author = page.author && typeof page.author === 'object' ? (page.author as { name?: string | null }) : null;
                return author?.name || 'Colleague';
              })()}
              {' · '}
              {version.publishedAt ? new Date(version.publishedAt).toLocaleString() : (version.updatedAt ? new Date(version.updatedAt).toLocaleString() : '')}
            </p>
          )}
        </div>
        <div className="row">
          {canPreview && (
            <Link className="button-link" href={`/editor?slug=${encodeURIComponent(slug)}`}>
              Edit page
            </Link>
          )}
          <Link className="button-link" href="/">Back to intranet</Link>
        </div>
      </div>
      <article className="panel">
        <PuckRenderer data={renderData} templates={templates} />
      </article>
      {page.kind === 'article' && (
        <>
          <ReactionBar type="page" id={slug} />
          <PageComments slug={slug} />
        </>
      )}
    </main>
  );
}
