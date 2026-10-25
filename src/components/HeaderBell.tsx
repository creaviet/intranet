'use client';
import { useEffect, useState } from 'react';

type Notification = { id: string; message: string; read: boolean; createdAt: string; actor?: { name?: string | null } | null };

export function HeaderBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  async function load() {
    const res = await fetch('/api/notifications');
    if (res.ok) setNotifications(await res.json());
  }
  useEffect(() => { void load(); const s = new EventSource('/api/notifications/stream'); s.addEventListener('notifications', () => void load()); return () => s.close(); }, []);
  const unread = notifications.filter((n) => !n.read).length;
  async function markRead(id: string) {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, read: true }) });
    void load();
  }
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" aria-label="Notifications" onClick={() => setOpen((v) => !v)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', position: 'relative' }}>
        🔔
        {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 28, width: 320, maxHeight: 400, overflow: 'auto', background: 'white', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100 }}>
          <h3 style={{ marginTop: 0 }}>Notifications</h3>
          {notifications.length === 0 ? <p className="muted">No notifications yet.</p> : notifications.map((n) => (
            <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div>{n.actor?.name || 'A colleague'} {n.message}</div>
              <div className="row"><span className="muted" style={{ fontSize: 12 }}>{new Date(n.createdAt).toLocaleString()}</span>{!n.read && <button className="secondary" onClick={() => markRead(n.id)}>Mark read</button>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}