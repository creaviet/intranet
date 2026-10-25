import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth/config';
import { isEditorRole, requireEmployee } from '@/lib/identity';
import { findTemplateById, findTemplateSummaries, toTemplateSummary } from '@/lib/templates';
import { BlockEditor } from '@/components/BlockEditor';

const TEMPLATE_ID = /^[a-zA-Z0-9_-]{1,100}$/;

export default async function BlockEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/');

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
            the editor role before editing reusable blocks.
          </p>
          <Link className="button-link" href="/">Back to the intranet</Link>
        </section>
      </main>
    );
  }

  const { id } = await params;
  const template = TEMPLATE_ID.test(id) ? await findTemplateById(payload, id) : null;
  const summary = template ? toTemplateSummary(template) : null;

  if (!summary) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Block not found</h1>
          <p className="muted">This reusable block does not exist or contains invalid data.</p>
          <Link className="button-link" href="/editor">Back to the content editor</Link>
        </section>
      </main>
    );
  }

  const templates = (await findTemplateSummaries(payload)).filter((item) => item.id !== summary.id);

  return (
    <main className="shell">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>
            {summary.mode === 'template' ? 'Template block editor' : 'Fixed block editor'}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {summary.mode === 'template'
              ? `Editing the structure of “${summary.name}”. Saving creates a new template block.`
              : `Editing the shared fixed block “${summary.name}”.`}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="button-link" href="/editor">All content</Link>
          <Link className="button-link" href="/">Back to intranet</Link>
        </div>
      </div>
      <BlockEditor
        id={summary.id}
        initialName={summary.name}
        initialMode={summary.mode}
        initialData={summary.data}
        initialUpdatedAt={template?.updatedAt ?? null}
        availableTemplates={templates}
      />
    </main>
  );
}
