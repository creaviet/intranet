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

export const dynamic = 'force-dynamic';

export default async function StandalonePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string | string[] }> }) {
  const session = await auth();
  if (!session?.user) redirect('/');
  const { slug } = await params;
  if (isValidSlug(slug) === false) notFound();
  // avoid capturing reserved routes (handled by static routes anyway)
  const payload = await getPayload({ config });
  const page = await findPageBySlug(payload, slug);
  if (!page || page.kind !== 'page') notFound();
  const query = await searchParams;
  const previewParam = Array.isArray(query.preview) ? query.preview[0] : query.preview;
  const wantsPreview = previewParam === 'draft';
  let canPreview = false;
  if (wantsPreview) {
    canPreview = await requireEditor().then(() => true).catch(() => false);
    if (!canPreview) notFound();
  }
  const version = wantsPreview ? getDraftVersion(page) : getPublishedVersion(page);
  if (!version) notFound();
  let renderData = version.data;
  const layoutSlug = page.layoutSlug;
  if (layoutSlug) {
    const layoutPage = await findPageBySlug(payload, layoutSlug);
    const layoutVersion = layoutPage ? (wantsPreview ? getDraftVersion(layoutPage) : getPublishedVersion(layoutPage)) : null;
    if (layoutVersion) {
      const combined = structuredClone(layoutVersion.data) as typeof layoutVersion.data;
      const inject = (value: unknown): boolean => {
        if (Array.isArray(value)) { for (const item of value) if (inject(item)) return true; return false; }
        if (!value || typeof value !== 'object') return false;
        const record = value as Record<string, unknown>;
        if (record.type === 'Frame' && record.props && typeof record.props === 'object') { (record.props as Record<string, unknown>).content = version.data.content; return true; }
        for (const key of Object.keys(record)) if (inject(record[key])) return true;
        return false;
      };
      if (inject(combined)) renderData = combined;
    }
  }
  const templates = selectReferencedTemplates(renderData, await findTemplateSummaries(payload));
  return (
    <main className="shell">
      {wantsPreview && <p role="status" style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px' }}>Draft preview</p>}
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          {canPreview && <Link className="button-link" href={`/editor?slug=${encodeURIComponent(slug)}`}>Edit page</Link>}
        </div>
      </div>
      <article className="panel"><PuckRenderer data={renderData} templates={templates} /></article>
    </main>
  );
}