import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Fingerprint, CalendarCheck2, FileBarChart2, ScrollText, LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../store/auth';
import { NotificationBell, ThemeToggle } from '../../components/shared';

const nav = [
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/attendance', label: 'Attendance', icon: Fingerprint },
  { to: '/admin/leaves', label: 'Leaves', icon: CalendarCheck2 },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart2 },
  { to: '/admin/activity', label: 'Activity log', icon: ScrollText },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, end, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition
             ${isActive
              ? 'bg-cobalt-500 text-white shadow-glow'
              : 'text-ink-700/80 hover:bg-mist-200/70 dark:text-mist-200/80 dark:hover:bg-ink-700/70'}`}
        >
          <Icon size={18} /> {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-mist-200/70 bg-white/60 p-4 backdrop-blur-xl dark:border-ink-700 dark:bg-ink-900/60 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cobalt-Mer500">
            <svg viewBox="0 0 32 32" className="h-6 w-6">
              <path d="M8 22 A9 9 0 0 1 24 22" stroke="#F0A020" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle cx="16" cy="11" r="2.5" fill="white" />
            </svg>
          </div>
          <span className="font-display text-lg font-extrabold tracking-tight">SEL</span>
        </div>
        {links}
        <div className="mt-auto">
          <button onClick={() => { logout(); navigate('/login'); }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-coral-500 hover:bg-coral-400/10">
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink-950/50 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="glass h-full w-64 rounded-none p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-6 px-2 font-display text-lg font-extrabold">SEL</p>
            {links}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-mist-200/70 bg-mist-50/80 px-4 py-3 backdrop-blur-xl dark:border-ink-700 dark:bg-ink-950/80 sm:px-6">
          <div className="flex items-center gap-2">
            <button className="rounded-xl p-2 hover:bg-mist-200 dark:hover:bg-ink-700 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={18} />
            </button>
            <p className="text-sm text-ink-600/70 dark:text-mist-300/60">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <NotificationBell />
            <div className="ml-2 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-saffron-400/20 font-display text-sm font-bold text-saffron-600">
                {user?.name?.[0]}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight">{user?.name}</p>
                <p className="text-xs text-ink-600/60 dark:text-mist-300/50">{user?.designation || 'Administrator'}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
