'use client';
import { useEffect, useState } from 'react';

export function FollowButton({ userId }: { userId: string }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/users/${userId}/follow`).then((r) => r.ok ? r.json() : { following: false }).then((d) => setFollowing(!!d.following)).finally(() => setLoading(false));
  }, [userId]);
  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/users/${userId}/follow`, { method: 'POST' });
    if (res.ok) { const d = await res.json(); setFollowing(!!d.following); }
    setLoading(false);
  }
  return (
    <button className="secondary" onClick={toggle} disabled={loading}>
      {loading ? '…' : following ? 'Unfollow' : 'Follow'}
    </button>
  );
}