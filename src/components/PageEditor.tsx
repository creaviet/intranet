'use client';
import { Puck, type Data } from '@measured/puck';
import '@measured/puck/puck.css';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPuckConfig } from '@/puck/config';
import { slugToTitle, type TemplateMode, type TemplateSummary } from '@/lib/puck';

type PublishStatus = 'draft' | 'published';
type ContentKind = 'page' | 'article' | 'layout';
type SavingState = PublishStatus | 'unpublish' | null;

type PageEditorProps = {
  slug: string;
  initialTitle?: string;
  initialStatus?: PublishStatus;
  initialData: Data;
  initialUpdatedAt?: string;
  initialPublishedAt?: string | null;
  initialHasUnpublishedChanges?: boolean;
  initialKind?: ContentKind;
  initialTemplates?: TemplateSummary[];
  initialLayoutSlug?: string | null;
  availableLayouts?: { slug: string; title: string }[];
};

export function PageEditor({
  slug,
  initialTitle,
  initialStatus = 'draft',
  initialData,
  initialUpdatedAt,
  initialPublishedAt,
  initialHasUnpublishedChanges,
  initialKind = 'page',
  initialTemplates = [],
  initialLayoutSlug = null,
  availableLayouts = [],
}: PageEditorProps) {
  const [data, setData] = useState<Data>(initialData);
  const router = useRouter();
  const [editBlocks, setEditBlocks] = useState(false);
  const [blinkName, setBlinkName] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle || slugToTitle(slug));
  const [status, setStatus] = useState<PublishStatus>(initialStatus);
  const [kind, setKind] = useState<ContentKind>(initialKind);
  const [layoutSlug, setLayoutSlug] = useState<string | null>(initialLayoutSlug);
  const [templates, setTemplates] = useState<TemplateSummary[]>(initialTemplates);
  const recentBlocks = useMemo(
    () => [...templates].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5),
    [templates],
  );
  const [blockName, setBlockName] = useState('');
  const [blockMode, setBlockMode] = useState<TemplateMode>('fixed');
  const [savingBlock, setSavingBlock] = useState(false);
  const config = useMemo(() => createPuckConfig(templates), [templates]);
  const overrides = useMemo(
    () => ({
      drawer: ({ children }: { children: React.ReactNode }) => (
        <div className={editBlocks ? 'puck-edit-mode' : ''}>
          <div className="row" style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <label className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={editBlocks}
                onChange={(event) => setEditBlocks(event.target.checked)}
                style={{ width: 'auto' }}
              />
              <span>Edit</span>
            </label>
            {editBlocks && <span className="muted">Select a saved block to edit it.</span>}
          </div>
          {children}
        </div>
      ),
      drawerItem: ({ children, name }: { children: React.ReactNode; name: string }) => {
        const isBlock = name.startsWith('SavedBlock_') || name.startsWith('TemplateBlock_');
        const id = isBlock ? name.replace(/^SavedBlock_|^TemplateBlock_/, '') : null;
        return (
          <div data-block-name={name} className={blinkName === name ? 'puck-blink' : ''} style={{ position: 'relative' }}>
            {children}
            {editBlocks && isBlock && id && (
              <button
                type="button"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '4px 8px',
                  fontSize: '0.8rem',
                }}
                onClick={() => router.push(`/editor/blocks/${id}`)}
              >
                Edit
              </button>
            )}
          </div>
        );
      },
    }),
    [editBlocks, blinkName, router],
  );
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(initialUpdatedAt);
  const [publishedAt, setPublishedAt] = useState<string | null | undefined>(initialPublishedAt);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(
    initialHasUnpublishedChanges ?? initialStatus !== 'published',
  );
  const [saving, setSaving] = useState<SavingState>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function applySavedPage(body: Record<string, unknown>) {
    setStatus(body.status === 'published' ? 'published' : 'draft');
    setKind(body.kind === 'article' ? 'article' : body.kind === 'layout' ? 'layout' : 'page');
    setLayoutSlug(typeof body.layoutSlug === 'string' ? body.layoutSlug : null);
    setUpdatedAt(typeof body.updatedAt === 'string' ? body.updatedAt : undefined);
    setPublishedAt(typeof body.publishedAt === 'string' ? body.publishedAt : null);
    setHasUnpublishedChanges(body.hasUnpublishedChanges !== false);
  }

  function highlightBlock(name: string) {
    const el = document.querySelector(`[data-block-name="${name}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setBlinkName(name);
      window.setTimeout(() => setBlinkName((current) => (current === name ? null : current)), 1800);
    }
  }

  async function persist(nextStatus: PublishStatus, pageData: Data) {
    if (!title.trim()) {
      setNotice('');
      setError('Add a title before saving.');
      return;
    }

    setSaving(nextStatus);
    setError('');
    setNotice('');

    try {
      const res = await fetch('/api/puck', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title: title.trim(), data: pageData, status: nextStatus, kind, layoutSlug: kind === 'layout' ? null : layoutSlug }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not save the page.');
        return;
      }

      applySavedPage(body);
      setNotice(
        nextStatus === 'published'
          ? kind === 'article'
            ? 'Article published to the intranet feed.'
            : 'Page published.'
          : 'Draft saved.',
      );
    } catch {
      setError('Could not reach the server. Your changes are still in this browser.');
    } finally {
      setSaving(null);
    }
  }

  async function unpublish() {
    if (!window.confirm('Take this page offline? The draft stays available for editing.')) return;

    setSaving('unpublish');
    setError('');
    setNotice('');

    try {
      const res = await fetch('/api/puck', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not unpublish the page.');
        return;
      }

      applySavedPage(body);
      setNotice('Page unpublished. The draft is still available.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(null);
    }
  }

  async function saveBlock() {
    if (!blockName.trim()) {
      setNotice('');
      setError('Give the reusable block a name first.');
      return;
    }
    if (data.content.length === 0) {
      setNotice('');
      setError('Add at least one component before saving a reusable block.');
      return;
    }

    setSavingBlock(true);
    setError('');
    setNotice('');

    try {
      const res = await fetch('/api/puck/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: blockName.trim(), data, mode: blockMode }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not save the reusable block.');
        return;
      }

      const template = body.template as TemplateSummary | undefined;
      if (!template) {
        setError('Saved block could not be read back.');
        return;
      }

      setTemplates((current) =>
        [...current.filter((item) => item.id !== template.id), template].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setBlockName('');
      setNotice(
        template.mode === 'template'
          ? `Template block “${template.name}” saved. Insert it to fill in unique content on each page.`
          : `Fixed block “${template.name}” saved. All pages using it share the same content.`,
      );
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSavingBlock(false);
    }
  }

  const stateLabel =
    status === 'published'
      ? hasUnpublishedChanges
        ? 'Published · draft has unpublished changes'
        : 'Published · up to date'
      : 'Not published';

  return (
    <div>
      <section className="panel" style={{ display: 'grid', gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 320px' }}>
            <span className="muted">{kind === 'article' ? 'Article title' : 'Page title'}</span>
            <input
              aria-label={kind === 'article' ? 'Article title' : 'Page title'}
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span className="muted">/{slug}</span>
            <Link className="button-link" href={`/p/${slug}?preview=draft`} target="_blank" rel="noreferrer">
              Preview draft
            </Link>
            {status === 'published' && (
              <Link className="button-link" href={`/p/${slug}`} target="_blank" rel="noreferrer">
                View published
              </Link>
            )}
            <button
              type="button"
              className="secondary"
              disabled={saving !== null}
              onClick={() => void persist('draft', data)}
            >
              {saving === 'draft' ? 'Saving…' : 'Save draft'}
            </button>
            {status === 'published' && (
              <button
                type="button"
                className="secondary"
                disabled={saving !== null}
                onClick={() => void unpublish()}
              >
                {saving === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
              </button>
            )}
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Status: <strong>{stateLabel}</strong>
          {publishedAt ? ` · published ${new Date(publishedAt).toLocaleString()}` : ''}
          {updatedAt ? ` · draft saved ${new Date(updatedAt).toLocaleString()}` : ''}
          {' · '}Use the editor&apos;s Publish button to publish the current canvas.
        </p>
        <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', margin: 0 }}>
          <legend className="muted" style={{ padding: '0 6px' }}>Content type</legend>
          <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="radio"
                name="content-kind"
                value="article"
                checked={kind === 'article'}
                style={{ width: 'auto' }}
                onChange={() => setKind('article')}
              />
              <span>
                <strong>Article</strong> — published in the Company feed on <code>/</code>
              </span>
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="radio"
                name="content-kind"
                value="page"
                checked={kind === 'page'}
                style={{ width: 'auto' }}
                onChange={() => setKind('page')}
              />
              <span>
                <strong>Page</strong> — standalone, not listed in the feed
              </span>
            </label>
          </div>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {kind === 'article'
              ? 'Once published, this article is linked from the home feed and keeps the same public URL.'
              : 'This page stays off the home feed. Use it for standalone content such as an About page.'}
          </p>
        </fieldset>
        {kind !== 'layout' && availableLayouts.length > 0 && (
          <label style={{ flex: '1 1 320px' }}>
            <span className="muted">Master layout (optional)</span>
            <select
              aria-label="Master layout"
              value={layoutSlug ?? ''}
              onChange={(event) => setLayoutSlug(event.target.value || null)}
            >
              <option value="">None</option>
              {availableLayouts.map((layout) => (
                <option key={layout.slug} value={layout.slug}>
                  {layout.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="row" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 240px' }}>
            <span className="muted">Save the current canvas as a reusable block</span>
            <input
              aria-label="Reusable block name"
              placeholder="e.g. Onboarding banner"
              value={blockName}
              maxLength={100}
              onChange={(event) => setBlockName(event.target.value)}
            />
          </label>
          <label style={{ flex: '0 1 190px' }}>
            <span className="muted">Block type</span>
            <select
              aria-label="Block type"
              value={blockMode}
              onChange={(event) => setBlockMode(event.target.value === 'template' ? 'template' : 'fixed')}
            >
              <option value="fixed">Fixed block</option>
              <option value="template">Template block</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={savingBlock || saving !== null}
            onClick={() => void saveBlock()}
          >
            {savingBlock ? 'Saving block…' : 'Save as block'}
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {blockMode === 'template'
            ? 'Template blocks keep this structure and expose every text field for per-page content. Changing the structure later saves a new template block.'
            : 'Fixed blocks share one content instance. Editing the block changes every page that uses it.'}
        </p>
        {templates.length > 0 && (
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <span className="muted">Saved blocks (last {Math.min(5, templates.length)})</span>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8, gap: 8 }}>
              {recentBlocks.map((template) => {
                const componentName =
                  template.mode === 'template' ? `TemplateBlock_${template.id}` : `SavedBlock_${template.id}`;
                return (
                  <button
                    type="button"
                    className="button-link"
                    key={template.id}
                    onClick={() => highlightBlock(componentName)}
                  >
                    {template.name}
                  </button>
                );
              })}
            </div>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Click a block name to highlight it in the Components list.
            </p>
          </div>
        )}
        {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
        {notice && <p role="status" style={{ margin: 0 }}>{notice}</p>}
      </section>

      <div style={{ background: 'white', minHeight: 500 }}>
        <Puck
          config={config}
          data={data}
          overrides={overrides}
          onChange={(next) => {
            setData(next);
            if (status === 'published') setHasUnpublishedChanges(true);
          }}
          onPublish={(next) => {
            setData(next);
            void persist('published', next);
          }}
        />
      </div>
    </div>
  );
}
