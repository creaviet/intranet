'use client';
import { useCallback, useEffect, useState } from 'react';

type Reaction = { emoji: string; user: { id: string; name: string | null } | null };

const EMOJIS = ['👍', '❤️', '🎉', '🙌'];

export function ReactionBar({ type, id }: { type: 'post' | 'page'; id: string }) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const url = type === 'post' ? `/api/posts/${id}/reactions` : `/api/pages/${id}/reactions`;
    const res = await fetch(url);
    if (res.ok) setReactions(await res.json());
  }, [type, id]);

  useEffect(() => { void load(); }, [load]);

  async function react(emoji: string) {
    const url = type === 'post' ? `/api/posts/${id}/reactions` : `/api/pages/${id}/reactions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    if (res.ok) { setNotice(''); void load(); }
    else setNotice('Could not save reaction.');
  }

  const grouped = EMOJIS.map((emoji) => {
    const list = reactions.filter((r) => r.emoji === emoji);
    return { emoji, list };
  });

  return (
    <div>
      {notice && <p role="status" className="muted">{notice}</p>}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {grouped.map(({ emoji, list }) => (
          <button
            key={emoji}
            className="secondary"
            aria-label={`React ${emoji}`}
            title={list.map((r) => r.user?.name || 'Someone').join(', ')}
            onClick={() => react(emoji)}
          >
            {emoji} {list.length > 0 && <span>({list.length})</span>}
          </button>
        ))}
      </div>
      {grouped.some((g) => g.list.length > 0) && (
        <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
          {grouped
            .filter((g) => g.list.length > 0)
            .map((g) => `${g.emoji}: ${g.list.map((r) => r.user?.name || 'Someone').join(', ')}`)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}
