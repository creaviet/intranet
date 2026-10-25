'use client';
import { useEffect, useState } from 'react';
import { ReactionBar } from '@/components/ReactionBar';

type RichTextNode = { type?: string; text?: string; children?: RichTextNode[] };
type UserRef = { id: string; name?: string | null; department?: string | null };
type Post = { id: string; title: string; body: { root?: RichTextNode } | null; author?: UserRef | null; createdAt: string };

type FeedItem =
  | { kind: 'post'; date: string; post: Post }
  | { kind: 'article'; date: string; article: { slug: string; title: string; publishedAt: string | null; preview: string; author: { id: string; name: string | null; department: string | null } | null } };

function richTextToString(body: Post['body']): string {
  const out: string[] = [];
  const visit = (node: RichTextNode | undefined) => {
    if (!node) return;
    if (node.type === 'text' && node.text) out.push(node.text);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(body?.root);
  return out.join('');
}

function dateValue(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function CompanyFeed({ departments = '', users = '', tags = '', loadingStyle = 'skeleton' }: { departments?: string; users?: string; tags?: string; loadingStyle?: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (departments.trim()) params.set('departments', departments.trim());
    if (users.trim()) params.set('users', users.trim());
    if (tags.trim()) params.set('tags', tags.trim());
    fetch(`/api/feed?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) { setItems([]); return; }
        const mapped: FeedItem[] = data.map((raw: Record<string, unknown>) => {
          if (raw.kind === 'post') {
            return {
              kind: 'post',
              date: String(raw.date ?? ''),
              post: raw.post as Post,
            };
          }
          return {
            kind: 'article',
            date: String(raw.date ?? ''),
            article: {
              slug: String(raw.url ?? '').replace('/p/', ''),
              title: String(raw.title ?? ''),
              publishedAt: (raw.date as string) ?? null,
              preview: String(raw.preview ?? ''),
              author: (raw.author as { id: string; name: string | null; department: string | null } | null) ?? null,
            },
          };
        });
        setItems(mapped.sort((a, b) => dateValue(b.date) - dateValue(a.date)));
      })
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [departments, users, tags]);

  async function comment(postId: string, value: string) {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: value }),
    });
    if (res.ok) setNotice('Comment added.');
    else setNotice('Could not add comment.');
  }

  return (
    <section>
      {notice && <p role="status">{notice}</p>}
      {isLoading && (loadingStyle === 'spinner' ? (
        <div style={{ padding: 24, textAlign: 'center' }}><span className="skeleton-pulse" style={{ display: 'inline-block', width: 32, height: 32, borderRadius: '50%' }} /></div>
      ) : (
        <div>
          {[0, 1].map((i) => (
            <div key={i} className="panel" style={{ marginBottom: 12 }}>
              <div className="skeleton-pulse" style={{ height: 14, width: '40%', marginBottom: 8 }} />
              <div className="skeleton-pulse" style={{ height: 12, width: '90%', marginBottom: 4 }} />
              <div className="skeleton-pulse" style={{ height: 12, width: '75%', marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="skeleton-pulse" style={{ height: 28, width: 44 }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="skeleton-pulse" style={{ height: 32, flex: 1 }} />
                <div className="skeleton-pulse" style={{ height: 32, width: 80 }} />
              </div>
            </div>
          ))}
        </div>
      ))}
      {!isLoading && items.length === 0 && <p>No posts or articles yet.</p>}
      {items.map((item) =>
        item.kind === 'article' ? (
          <article key={`article-${item.article.slug}`} className="panel">
            <p className="muted" style={{ margin: 0 }}>
              {item.article.author?.name || item.article.author?.department || 'Unknown'}{item.article.author?.department && item.article.author?.name ? ` · ${item.article.author.department}` : ''} · {item.article.publishedAt ? new Date(item.article.publishedAt).toLocaleString() : 'Published'}
            </p>
            <h3 style={{ marginBottom: 6, marginTop: 6 }}>
              <a href={`/p/${item.article.slug}`}>{item.article.title}</a>
            </h3>
            {item.article.preview && (
              <p style={{ color: '#94a3b8', maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)' }}>
                {item.article.preview}
              </p>
            )}
            <a href={`/p/${item.article.slug}`}>ganzen Artikel lesen →</a>
            <ReactionBar type="page" id={item.article.slug} />
            <PageCommentBox slug={item.article.slug} />
          </article>
        ) : (
          <article key={item.post.id} className="panel">
            <p className="muted" style={{ margin: 0 }}>
              {item.post.author?.name || item.post.author?.department || 'Unknown'}{item.post.author?.department && item.post.author?.name ? ` · ${item.post.author.department}` : ''} · {new Date(item.post.createdAt).toLocaleString()}
            </p>
            <h3 style={{ marginBottom: 6, marginTop: 6 }}>{item.post.title}</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{richTextToString(item.post.body)}</p>
            <ReactionBar type="post" id={item.post.id} />
            <CommentBox postId={item.post.id} onComment={comment} />
          </article>
        ),
      )}
    </section>
  );
}

function CommentBox({ postId, onComment }: { postId: string; onComment: (id: string, value: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        await onComment(postId, value);
        setValue('');
      }}
      style={{ marginTop: 14 }}
    >
      <div className="row">
        <input aria-label="Add a comment" placeholder="Write a comment…" value={value} onChange={(e) => setValue(e.target.value)} maxLength={5000} />
        <button type="submit">Comment</button>
      </div>
    </form>
  );
}


function PageCommentBox({ slug }: { slug: string }) {
  const [value, setValue] = useState('');
  const [notice, setNotice] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        const res = await fetch(`/api/pages/${slug}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: value }),
        });
        if (res.ok) { setNotice('Comment added.'); setValue(''); }
        else setNotice('Could not add comment.');
      }}
      style={{ marginTop: 14 }}
    >
      {notice && <p role="status">{notice}</p>}
      <div className="row">
        <input aria-label="Add a comment" placeholder="Write a comment…" value={value} onChange={(e) => setValue(e.target.value)} maxLength={5000} />
        <button type="submit">Comment</button>
      </div>
    </form>
  );
}
