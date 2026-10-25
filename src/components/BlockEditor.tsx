'use client';
import { Puck, type Data } from '@measured/puck';
import '@measured/puck/puck.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createPuckConfig } from '@/puck/config';
import type { TemplateMode, TemplateSummary } from '@/lib/puck';

type BlockEditorProps = {
  id: string;
  initialName: string;
  initialMode: TemplateMode;
  initialData: Data;
  initialUpdatedAt?: string | null;
  availableTemplates?: TemplateSummary[];
};

function nextTemplateName(baseName: string, available: TemplateSummary[]): string {
  const taken = new Set([
    baseName.trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
    ...available.map((template) => template.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
  ]);
  const stem = `${baseName.trim()} v2`;
  let candidate = stem;
  let index = 3;
  while (taken.has(candidate.toLocaleLowerCase())) {
    candidate = `${stem} (${index++})`;
  }
  return candidate;
}

export function BlockEditor({
  id,
  initialName,
  initialMode,
  initialData,
  initialUpdatedAt,
  availableTemplates = [],
}: BlockEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(() =>
    initialMode === 'template' ? nextTemplateName(initialName, availableTemplates) : initialName,
  );
  const [data, setData] = useState<Data>(initialData);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const config = useMemo(() => createPuckConfig(availableTemplates), [availableTemplates]);
  const isTemplate = initialMode === 'template';

  async function save(nextData: Data) {
    if (saving) return;
    if (!name.trim()) {
      setNotice('');
      setError('Give the reusable block a name first.');
      return;
    }
    if (nextData.content.length === 0) {
      setNotice('');
      setError('Add at least one component before saving the block.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const res = await fetch('/api/puck/templates', {
        method: isTemplate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isTemplate
            ? { name: name.trim(), mode: 'template', data: nextData }
            : { id, name: name.trim(), data: nextData },
        ),
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

      if (isTemplate) {
        router.push(`/editor/blocks/${template.id}`);
        router.refresh();
        return;
      }

      setName(template.name);
      setUpdatedAt(new Date().toISOString());
      setNotice('Fixed block saved. Every page using it now renders the updated content.');
    } catch {
      setError('Could not reach the server. Your changes are still in this browser.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <section className="panel" style={{ display: 'grid', gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 320px' }}>
            <span className="muted">{isTemplate ? 'New template block name' : 'Block name'}</span>
            <input
              aria-label={isTemplate ? 'New template block name' : 'Block name'}
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Link className="button-link" href="/editor">All content</Link>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(data)}
            >
              {saving
                ? 'Saving…'
                : isTemplate
                  ? 'Save as new template'
                  : 'Save block'}
            </button>
          </div>
        </div>
        {isTemplate ? (
          <p className="muted" style={{ margin: 0 }}>
            This is a template block. Its structure is fixed for existing pages. Saving always creates a{' '}
            <strong>new template block</strong>; pages already using this one keep their current structure and
            content. You can also save with Puck&apos;s Publish button.
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString()}. ` : ''}
            This is a fixed block. Changes apply immediately to every page that embeds it. You can also save
            with Puck&apos;s Publish button.
          </p>
        )}
        <p className="muted" style={{ margin: 0 }}>
          {isTemplate
            ? 'Every text and textarea field in this structure becomes an editable field on each inserted instance.'
            : 'This block is not available inside itself, which prevents recursive rendering.'}
        </p>
        {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
        {notice && <p role="status" style={{ margin: 0 }}>{notice}</p>}
      </section>

      <div style={{ background: 'white', minHeight: 500 }}>
        <Puck
          config={config}
          data={data}
          onChange={setData}
          onPublish={(next) => {
            setData(next);
            void save(next);
          }}
        />
      </div>
    </div>
  );
}
