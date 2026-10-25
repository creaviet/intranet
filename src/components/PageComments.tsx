'use client';
import { useCallback, useEffect, useState } from 'react';

type Comment = { id: string; body: string; author?: { name?: string | null } | null; createdAt: string };

export function PageComments({ slug }: { slug: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [value, setValue] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/pages/${slug}/comments`);
    if (res.ok) setComments(await res.json());
  }, [slug]);

  useEffect(() => { void load(); }, [slug, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    const res = await fetch(`/api/pages/${slug}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: value }),
    });
    if (res.ok) { setNotice('Comment added.'); setValue(''); void load(); }
    else setNotice('Could not add comment.');
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h3>Comments</h3>
      {comments.length === 0 && <p className="muted">No comments yet.</p>}
      {comments.map((c) => (
        <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0 }}>{c.body}</p>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            {c.author?.name || 'Colleague'} · {new Date(c.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="row">
          <input aria-label="Add a comment" placeholder="Write a comment…" value={value} onChange={(e) => setValue(e.target.value)} maxLength={5000} />
          <button type="submit">Comment</button>
        </div>
      </form>
    </section>
  );
}
