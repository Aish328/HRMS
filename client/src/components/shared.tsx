import { useEffect, useRef, useState, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Bell, Moon, Sun, CalendarCheck2, UserRound, Megaphone } from 'lucide-react';
import { api, fetchBlobUrl } from '../api/client';
import { useAuth } from '../store/auth';
import type { Notification } from '../types';
import { Skeleton } from './ui';

/* ---------- Theme toggle (persists, class strategy) ---------- */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem('hrms.theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('hrms.theme', dark ? 'dark' : 'light');
  }, [dark]);
  return (
    <button
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-xl p-2 text-ink-700/70 transition hover:bg-mist-200 dark:text-mist-200 dark:hover:bg-ink-700"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function applySavedTheme() {
  document.documentElement.classList.toggle('dark', localStorage.getItem('hrms.theme') === 'dark');
}

/* ---------- Notification bell with polling ---------- */
const kindIcon: Record<string, ReactNode> = {
  leave: <CalendarCheck2 size={16} className="text-saffron-500" />,
  attendance: <UserRound size={16} className="text-cobalt-500" />,
  system: <Megaphone size={16} className="text-jade-500" />,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await api<{ notifications: Notification[]; unread: number }>('/notifications');
      setItems(data.notifications);
      setUnread(data.unread);
    } catch { /* silent — polling */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 25_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openPanel = async () => {
    setOpen((o) => !o);
    if (!open && unread > 0) {
      await api('/notifications/read-all', { method: 'POST' });
      setUnread(0);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={openPanel} aria-label="Notifications"
        className="relative rounded-xl p-2 text-ink-700/70 transition hover:bg-mist-200 dark:text-mist-200 dark:hover:bg-ink-700">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="glass absolute right-0 z-40 mt-2 max-h-96 w-80 overflow-y-auto p-2 animate-rise">
          <p className="px-3 py-2 font-display text-sm font-bold">Notifications</p>
          {items.length === 0 && <p className="px-3 pb-3 text-sm text-ink-600/60 dark:text-mist-300/60">Nothing here yet.</p>}
          {items.map((n) => (
            <div key={n.id} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-mist-100 dark:hover:bg-ink-700/60">
              <div className="mt-0.5">{kindIcon[n.kind] || kindIcon.system}</div>
              <div className="min-w-0">
                <p className={`truncate text-sm ${n.read ? 'font-medium' : 'font-bold'}`}>{n.title}</p>
                {n.body && <p className="text-xs text-ink-600/70 dark:text-mist-300/60">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-ink-600/50 dark:text-mist-300/40">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}

/* ---------- Selfie image (auth-protected, loaded via blob) ---------- */
export function SelfieImage({ file, className = '' }: { file: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked: string | null = null;
    setUrl(null); setFailed(false);
    if (file) {
      fetchBlobUrl(`/uploads/${file}`)
        .then((u) => { revoked = u; setUrl(u); })
        .catch(() => setFailed(true));
    }
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [file]);

  if (!file || failed) {
    return <div className={`flex items-center justify-center bg-mist-200 text-xs text-ink-600/50 dark:bg-ink-700 ${className}`}>No photo</div>;
  }
  if (!url) return <Skeleton className={className} />;
  return <img src={url} alt="Attendance selfie" className={`object-cover ${className}`} />;
}

/* ---------- Route guards ---------- */
export function RequireRole({ role, children }: { role: 'admin' | 'employee'; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Skeleton className="h-10 w-40" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  // Admins may enter employee-gated areas too (so they can punch in like anyone
  // else). Employees still cannot reach admin-only routes.
  const allowed = user.role === role || (role === 'employee' && user.role === 'admin');
  if (!allowed) return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />;
  return <>{children}</>;
}
