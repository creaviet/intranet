'use client';
import { useEffect, useMemo, useState } from 'react';
import { ReactionBar } from '@/components/ReactionBar';

type UserRef = { id: string; name?: string | null };
type RichTextNode = { type?: string; text?: string; children?: RichTextNode[] };
type Post = { id: string; title: string; body: { root?: RichTextNode } | null; author?: UserRef | null; createdAt: string; mentions?: Array<{ id: string; name?: string | null } | string> | null; };
type Notification = { id: string; message: string; type: string; read: boolean; createdAt: string; post?: Post | null; actor?: UserRef | null; };
type ArticleLink = { slug: string; title: string; publishedAt: string | null; preview?: string; author?: { id?: string; name?: string | null; department?: string | null } | null };
type FeedItem =
  | { kind: 'post'; date: string; post: Post }
  | { kind: 'article'; date: string; article: ArticleLink };

function richTextToString(body: Post['body']): string {
  const out: string[] = [];
  const visit = (node: RichTextNode | undefined) => { if (!node) return; if (node.type === 'text' && node.text) out.push(node.text); if (Array.isArray(node.children)) node.children.forEach(visit); };
  visit(body?.root); return out.join('');
}
function dateValue(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
export function Intranet({ articles = [] }: { articles?: ArticleLink[] }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [search, setSearch] = useState(''); const [types, setTypes] = useState<Array<'post' | 'article'>>(['post', 'article']);
  const [showTop, setShowTop] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string | null }>>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function load() {
    const [p, n] = await Promise.all([fetch('/api/posts'), fetch('/api/notifications')]);
    if (p.ok) setPosts(await p.json()); if (n.ok) setNotifications(await n.json());
  }
  useEffect(() => { void load(); const source = new EventSource('/api/notifications/stream'); source.addEventListener('notifications', () => { void load(); }); return () => source.close(); }, []);
  useEffect(() => { fetch('/api/users?limit=100').then((r) => r.ok ? r.json() : { docs: [] }).then((d) => setUsers(Array.isArray(d?.docs) ? d.docs.map((u: { id: string; name?: string | null }) => ({ id: String(u.id), name: u.name ?? null })) : [])).catch(() => {}); }, []);
  useEffect(() => { fetch('/api/follows').then((r) => r.ok ? r.json() : { ids: [] }).then((d) => setFollowedIds(Array.isArray(d?.ids) ? d.ids : [])).catch(() => {}); }, []);
  useEffect(() => { const onScroll = () => setShowTop(window.scrollY > 300); window.addEventListener('scroll', onScroll); return () => window.removeEventListener('scroll', onScroll); }, []);
  async function createPost(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, text, mentions }) });
    if (!res.ok) { setError((await res.json()).error || 'Could not create post'); return; }
    setTitle(''); setText(''); setMentions([]); setNotice('Post published.'); await load();
  }
  async function react(postId: string, emoji: string) {
    const res = await fetch(`/api/posts/${postId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) });
    if (!res.ok) setError('Could not save reaction.');
    else setNotice(`Reaction ${emoji} saved.`);
  }
  async function comment(postId: string, value: string) {
    const res = await fetch(`/api/posts/${postId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: value }) });
    if (!res.ok) setError('Could not add comment.'); else { setNotice('Comment added.'); await load(); }
  }
  async function markRead(id: string) {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, read: true }) }); await load();
  }
  const feedItems = useMemo<FeedItem[]>(() => {
    const q = search.trim().toLowerCase();
    const items: FeedItem[] = [
      ...posts.map((post) => ({ kind: 'post' as const, date: post.createdAt, post })),
      ...articles.map((article) => ({
        kind: 'article' as const,
        date: article.publishedAt ?? '',
        article,
      })),
    ].filter((item) => {
      if (!types.includes(item.kind as 'post' | 'article')) return false;
      if (onlyFollowed) {
        const authorId = item.kind === 'post' ? item.post.author?.id : item.article.author?.id;
        if (!authorId || !followedIds.includes(String(authorId))) return false;
      }
      if (!q) return true;
      if (item.kind === 'post') {
        return (
          item.post.title.toLowerCase().includes(q) ||
          richTextToString(item.post.body).toLowerCase().includes(q)
        );
      }
      return (
        item.article.title.toLowerCase().includes(q) ||
        (item.article.preview ?? '').toLowerCase().includes(q)
      );
    });
    return items.sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }, [posts, articles, search, types, onlyFollowed, followedIds]);

  const usefulLinks = [
    { text: 'HR Portal', url: '/p/hr' },
    { text: 'IT Support', url: '/p/it-support' },
    { text: 'Company Handbook', url: '/p/handbook' },
    { text: 'Onboarding Guide', url: '/p/onboarding' },
  ];

  return <main className="shell">
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>
    <div>
    <section className="panel"><h2>Share an update</h2><form onSubmit={createPost}><div style={{ position: 'relative' }}>
<input aria-label="Post title" placeholder="Post title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} style={{ paddingRight: 28 }} />
{title && <button type="button" aria-label="Clear title" onClick={() => setTitle('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: '#e2e8f0', color: '#0f172a', width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>}
</div><div style={{ position: 'relative' }}>
<textarea aria-label="Post text" placeholder="What would you like to share? Type @ to mention someone." value={text} onChange={(e) => { const v = e.target.value; setText(v); const idx = v.lastIndexOf('@'); if (idx >= 0 && (idx === 0 || /\s/.test(v[idx - 1]))) { setMentionQuery(v.slice(idx + 1).split(/\s/)[0]); } else { setMentionQuery(''); } }} required maxLength={10000} rows={4} style={{ marginTop: 10, paddingRight: 28 }} />
{text && <button type="button" aria-label="Clear text" onClick={() => { setText(''); setMentionQuery(''); }} style={{ position: 'absolute', right: 6, top: 14, border: 'none', background: '#e2e8f0', color: '#0f172a', width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, padding: 0, zIndex: 1 }}>×</button>}
</div>
{mentionQuery && (
  <div className="panel" style={{ marginTop: 4, padding: 8 }}>
    {users.filter((u) => (u.name ?? '').toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5).map((u) => (
      <button key={u.id} type="button" className="secondary" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }} onClick={() => {
        const idx = text.lastIndexOf('@');
        const before = text.slice(0, idx);
        const after = text.slice(idx + 1 + mentionQuery.length);
        setText(before + '@' + (u.name ?? u.id) + ' ' + after);
        setMentions((m) => (m.includes(u.id) ? m : [...m, u.id]));
        setMentionQuery('');
      }}>
        {u.name ?? u.id}
      </button>
    ))}
    {users.filter((u) => (u.name ?? '').toLowerCase().includes(mentionQuery.toLowerCase())).length === 0 && <p className="muted" style={{ margin: 0 }}>No users found.</p>}
  </div>
)}<p className="muted">Starter note: @mention picker and rich-text composer are extension points; the API accepts user IDs in a mentions array.</p><button type="submit">Publish post</button></form>{error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</section>

    {feedItems.length === 0 && <p className="muted">No posts or articles yet. Be the first to share an update.</p>}
    {feedItems.map(item => item.kind === 'article' ? (
      <article className="panel" key={`article-${item.article.slug}`}>
        <p className="muted" style={{ margin: 0 }}>
          {item.article.author?.id ? <a href={`/u/${item.article.author.id}`}>{item.article.author?.name || 'Colleague'}</a> : (item.article.author?.name || 'Colleague')}{item.article.author?.department ? ` · ${item.article.author.department}` : ''} · {item.article.publishedAt ? new Date(item.article.publishedAt).toLocaleString() : 'Published'}
        </p>
        <h3 style={{ marginBottom: 6, marginTop: 6 }}><a href={`/p/${item.article.slug}`}>{item.article.title}</a></h3>
        {item.article.preview && (
          <p style={{ color: '#94a3b8', maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)' }}>
            {item.article.preview}
          </p>
        )}
        <a href={`/p/${item.article.slug}`}>Read the full article →</a>
        <ReactionBar type="page" id={item.article.slug} />
        <PageCommentBox slug={item.article.slug} />
      </article>
    ) : (
      <article className="panel" key={item.post.id}><p className="muted" style={{ margin: 0 }}>{item.post.author?.id ? <a href={`/u/${item.post.author.id}`}>{item.post.author?.name || 'Colleague'}</a> : (item.post.author?.name || 'Colleague')} · {new Date(item.post.createdAt).toLocaleString()}</p><h3 style={{ marginBottom: 6, marginTop: 6 }}>{item.post.title}</h3><p style={{ whiteSpace: 'pre-wrap' }}>
  {(() => {
    const text = richTextToString(item.post.body);
    const mentions = Array.isArray(item.post.mentions) ? item.post.mentions : [];
    const users = mentions.map((m) => (typeof m === 'string' ? { id: m, name: null } : { id: String(m.id), name: m.name ?? null })).filter((u) => u.name);
    if (users.length === 0) return text;
    const parts: any[] = [];
    let remaining = text;
    // Build a regex matching any mentioned name
    const names = users.map((u) => u.name!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`@(${names.join('|')})`, 'g');
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const name = m[1];
      const u = users.find((x) => x.name === name);
      parts.push(<a key={m.index} href={u ? `/u/${u.id}` : '#'}>@{name}</a>);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : text;
  })()}
</p><ReactionBar type="post" id={item.post.id} /><CommentBox postId={item.post.id} onComment={comment}/></article>
    ))}
    </div>
    <aside className="panel" style={{ position: 'sticky', top: 16 }}>
      <h2 style={{ marginTop: 0 }}>Search</h2>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input aria-label="Search posts and articles" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingRight: 28 }} />
        {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: '#e2e8f0', color: '#0f172a', width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <input type="checkbox" checked={onlyFollowed} onChange={(e) => setOnlyFollowed(e.target.checked)} style={{ width: 'auto' }} />
        <span>Only from people I follow</span>
      </label>
      <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={types.includes('post') && types.includes('article')} onChange={(e) => setTypes(e.target.checked ? ['post', 'article'] : [])} style={{ width: 'auto' }} /> All
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={types.includes('post')} onChange={(e) => setTypes((t) => e.target.checked ? [...new Set([...t, 'post'])] as Array<'post' | 'article'> : t.filter((x) => x !== 'post'))} style={{ width: 'auto' }} /> Posts
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={types.includes('article')} onChange={(e) => setTypes((t) => e.target.checked ? [...new Set([...t, 'article'])] as Array<'post' | 'article'> : t.filter((x) => x !== 'article'))} style={{ width: 'auto' }} /> Articles
        </label>
      </div>
      <h2>Useful links</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {usefulLinks.map((link) => (
          <li key={link.url} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
            <a href={link.url}>{link.text}</a>
          </li>
        ))}
      </ul>
      <h2 style={{ marginTop: 12 }}>Departments</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {['IT', 'HR', 'Leadership', 'Finance'].map((d) => (
          <li key={d} style={{ padding: '4px 0' }}><a href={`/departments/${d}`}>{d}</a></li>
        ))}
      </ul>
    </aside>
    </div>
  {showTop && <button type="button" aria-label="Go to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ position: 'fixed', bottom: 24, right: 24, width: 44, height: 44, borderRadius: '50%', border: 'none', background: '#0f172a', color: 'white', fontSize: 20, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 50 }}>↑</button>}
  </main>;
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

function CommentBox({ postId, onComment }: { postId: string; onComment: (id: string, value: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  return <form onSubmit={async e => { e.preventDefault(); if (!value.trim()) return; await onComment(postId, value); setValue(''); }} style={{ marginTop: 14 }}><div className="row"><div style={{ position: 'relative', flex: 1 }}><input aria-label="Add a comment" placeholder="Write a comment…" value={value} onChange={e => setValue(e.target.value)} maxLength={5000} style={{ paddingRight: 28, width: '100%' }} />{value && <button type="button" aria-label="Clear comment" onClick={() => setValue('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: '#e2e8f0', color: '#0f172a', width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, padding: 0, zIndex: 1 }}>×</button>}</div><button type="submit">Comment</button></div></form>;
}
