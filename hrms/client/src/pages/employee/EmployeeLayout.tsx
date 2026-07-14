import { NavLink, Outlet } from 'react-router-dom';
import { Home, Fingerprint, CalendarDays, UserRound, Network } from 'lucide-react';
import { NotificationBell, ThemeToggle } from '../../components/shared';
import { useAuth } from '../../store/auth';

const tabs = [
  { to: '/app', end: true, label: 'Home', icon: Home },
  { to: '/app/punch', label: 'Punch', icon: Fingerprint },
  { to: '/app/leaves', label: 'Leaves', icon: CalendarDays },
  { to: '/app/org', label: 'Org', icon: Network },
  { to: '/app/profile', label: 'Profile', icon: UserRound },
];

export default function EmployeeLayout() {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-mist-200/70 bg-mist-50/80 px-4 py-3 backdrop-blur-xl dark:border-ink-700 dark:bg-ink-950/80">
        <div>
          <p className="text-xs text-ink-600/60 dark:text-mist-300/50">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
          <p className="font-display text-base font-bold leading-tight">Hi, {user?.name?.split(' ')[0]} 👋</p>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-mist-200/70 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-ink-700 dark:bg-ink-900/85">
        <div className="grid grid-cols-5">
          {tabs.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition
                 ${isActive ? 'text-cobalt-500' : 'text-ink-600/50 dark:text-mist-300/40'}`}
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  {label}
                  <span className={`h-1 w-1 rounded-full ${isActive ? 'bg-cobalt-500' : 'bg-transparent'}`} />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
