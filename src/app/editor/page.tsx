import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth/config';
import { isEditorRole, requireEmployee } from '@/lib/identity';
import { DEFAULT_PUCK_DATA, isValidSlug, slugToTitle } from '@/lib/puck';
import {
  findPageBySlug,
  findPageList,
  getDraftVersion,
  getPageKind,
  hasUnpublishedChanges,
  type PageKind,
  type PageListItem,
} from '@/lib/pages';
import { findTemplateSummaries } from '@/lib/templates';
import type { TemplateSummary } from '@/lib/puck';
import { PageEditor } from '@/components/PageEditor';

function requestedKind(value: string | string[] | undefined): PageKind {
  const kind = Array.isArray(value) ? value[0] : value;
  return kind === 'article' ? 'article' : 'page';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function EditorDashboard({ pages, blocks }: { pages: PageListItem[]; blocks: TemplateSummary[] }) {
  return (
    <main className="shell">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Content editor</h1>
          <p className="muted" style={{ margin: 0 }}>
            Create an article for the intranet feed or a standalone page.
          </p>
        </div>
        <Link className="button-link" href="/">Back to intranet</Link>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Create content</h2>
        <form action="/editor" method="get" className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 280px' }}>
            <span className="muted">URL slug</span>
            <input
              name="slug"
              aria-label="URL slug"
              placeholder="e.g. onboarding-guide"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              title="Lowercase letters, numbers and single hyphens"
              required
              maxLength={120}
            />
          </label>
          <label style={{ flex: '0 1 220px' }}>
            <span className="muted">Content type</span>
            <select name="kind" defaultValue="article" aria-label="Content type">
              <option value="article">Article — intranet feed</option>
              <option value="page">Page — standalone</option>
            </select>
          </label>
          <button type="submit">Create</button>
        </form>
        <p className="muted" style={{ margin: '10px 0 0' }}>
          Articles are linked from the home feed once published. Pages are only reachable by their URL and are
          intended for standalone content.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Reusable blocks</h2>
        {blocks.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            No reusable blocks yet. Save a page canvas as a block from the page editor.
          </p>
        ) : (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {blocks.map((block) => (
              <Link className="button-link" key={block.id} href={`/editor/blocks/${block.id}`}>
                Edit {block.mode === 'template' ? 'template' : 'fixed block'} “{block.name}”
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Existing content</h2>
        {pages.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>No content yet. Create an article or page above.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Title</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Type</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Updated</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.slug}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                      <Link href={`/editor?slug=${encodeURIComponent(page.slug)}`}>{page.title}</Link>
                      <div className="muted"><code>/{page.slug}</code></div>
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                      {page.kind === 'article' ? 'Article' : 'Page'}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                      {page.status === 'published' ? 'Published' : 'Draft'}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                      {formatDate(page.updatedAt)}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                        <Link className="button-link" href={`/editor?slug=${encodeURIComponent(page.slug)}`}>Edit</Link>
                        {page.status === 'published' && (
                          <Link className="button-link" href={`/p/${page.slug}`} target="_blank" rel="noreferrer">
                            View
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string | string[]; kind?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/');

  const params = await searchParams;
  const requested = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const requestedSlug = requested?.trim().toLowerCase() || '';

  const context = await requireEmployee().catch(() => null);
  if (!context) redirect('/');
  const { payload, user } = context;

  if (!isEditorRole(user.role)) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Editors only</h1>
          <p className="muted">
            Your account has the <strong>{user.role || 'employee'}</strong> role. Ask an administrator to grant
            the editor role before publishing content.
          </p>
          <Link className="button-link" href="/">Back to the intranet</Link>
        </section>
      </main>
    );
  }

  if (!requestedSlug) {
    const [pages, blocks] = await Promise.all([
      findPageList(payload),
      findTemplateSummaries(payload),
    ]);
    return <EditorDashboard pages={pages} blocks={blocks} />;
  }

  const slug = requestedSlug;
  if (!isValidSlug(slug)) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Invalid page slug</h1>
          <p className="muted">
            Slugs use lowercase letters, numbers and single hyphens, e.g. <code>welcome</code> or{' '}
            <code>hr-policies</code>.
          </p>
          <Link className="button-link" href="/editor">Back to the content editor</Link>
        </section>
      </main>
    );
  }

  const page = await findPageBySlug(payload, slug);
  const draft = page ? getDraftVersion(page) : null;
  const templates = await findTemplateSummaries(payload);
  const allPages = await findPageList(payload);
  const layouts = allPages
    .filter((item) => item.kind === 'layout')
    .map((item) => ({ slug: item.slug, title: item.title }));
  const kind = page ? getPageKind(page) : requestedKind(params.kind);

  return (
    <main className="shell">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{kind === 'article' ? 'Article editor' : 'Page editor'}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {page
              ? `Editing the ${page.status === 'published' ? 'published' : 'draft'} ${kind}.`
              : `New ${kind}. Save a draft or publish it directly.`}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="button-link" href="/editor">All content</Link>
          <Link className="button-link" href="/">Back to intranet</Link>
        </div>
      </div>
      <PageEditor
        slug={slug}
        initialTitle={page?.title || slugToTitle(slug)}
        initialStatus={page?.status === 'published' ? 'published' : 'draft'}
        initialUpdatedAt={page?.updatedAt ?? undefined}
        initialPublishedAt={page?.publishedAt ?? null}
        initialHasUnpublishedChanges={page ? hasUnpublishedChanges(page) : true}
        initialKind={kind}
        initialTemplates={templates}
        initialLayoutSlug={page?.layoutSlug ?? null}
        availableLayouts={layouts}
        initialData={draft?.data ?? DEFAULT_PUCK_DATA}
      />
    </main>
  );
}
