import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Fingerprint, CalendarCheck2, FileBarChart2, ScrollText, LogOut, Menu, Network } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../store/auth';
import { NotificationBell, ThemeToggle } from '../../components/shared';

const nav = [
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/attendance', label: 'Attendance', icon: Fingerprint },
  { to: '/admin/leaves', label: 'Leaves', icon: CalendarCheck2 },
  { to: '/admin/org', label: 'Org chart', icon: Network },
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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cobalt-500">
            <svg viewBox="0 0 32 32" className="h-6 w-6">
              <path d="M8 22 A9 9 0 0 1 24 22" stroke="#F0A020" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle cx="16" cy="11" r="2.5" fill="white" />
            </svg>
          </div>
          <span className="font-display text-lg font-extrabold tracking-tight">Meridian</span>
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
            <div className="mb-6 px-2 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white p-0.5 shadow-glass">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAHeklEQVR4nO3dXXLjNhCFUcg1y7HG+99FxtJ6onmYoIZ2SAkkAfTt7u9U+SWVxBbQFw3+qhQAAAAAAAAAABDVxfoPiOB2fX+0/rvX2/3lmO/5/7X+P7Huh/Uf4Mnewpxl7e8iFG0IwBOqBd+CULQhAN94LvpXlp+NMPxBAErsot9CGP5IG4CMRb+ljkXGIKQLAIW/LWNXSBEAin6/LF0hdAAo/POiByFkACj8/qIGIVQAKPzxogUhRAAo/PmiBOHN+g84i+K3dbu+PzzPgdsAeB/4aLzOhcsAeB3s6DwuSq4C4HGAM/I0R24C4GlQz/r3sv3jxa+fPuZL/ixQpsKPpobg41P3TJF0B6D4Y1DuBrIBoPhj+Uc0BJIBoPjjuRTNTiB1DEDhx6d2XCDTASj+XFS6gUQAKP6cFEJgHgCK///eHts/Xmz93d//ufX8mwbA+sNDg2UdmAWA4seSVT2YBIDixxqLupgeAIo/p9ZjmNn1MTUAFD9azKyTaQGg+LHHrHoxPw0KbJkRgim3Qiit/lv31C8vzT+7QOPpXPya5UPsRy5Eef/83w0PgFLxr1G5J8VC/ewKV2S33K7vj5Fvnhi6BaL4ffj4vF+Ux2JkHQ0LgHLxq0+4FeUxGVVPUrdDj+b9JU4zeNgW9TSkAyiu/hT/PordYERddQ+AWvFfb/cLxX+M4laxd32Fvg5A4fehFoKeugZAafU/U/zW9+Mrvhfo4/N+UbkG0LPOugUgSvFjm9K49qq3cFsgpUmKKNr4dgmAyuofbXJUqYxzj7oL0wFUJiULlfE+G4LTAVBY/VUmI5sI434qABR/O+uzOKMojP+ZOnS9BVIYfPieh8MBsF791Qf9zPl76+sQR1jPx9F6dNkBrAcb6zzOy6EAWK/+Hj3++4nOMgRH6tLd7dAzBth6JbP+/Zns7gCWqz+F4YOnLuDmGIDi98XLfLkJANBqTxfYFQCr7Y+X1QRfeZi36R3g2b3uaz8eBhHbes9fa920ag4Apz7hSetD/dLHAJEfxctEuYtLBwAYrSkAFtsfVv9YLLpAyzaIDoDUJAPA6h+T4rHAywBw9geevdoGTe8Az+51f3uw+kd3tgu8qp+9z1BIboGAWQgAplM6FngagNn7f6WBQRzP6pgOgNRkAsDqDwsyAUAuKgseAUBqmwHgAhhG2/tsyJk3623VMx0AqUkEQGU/iLkUrvpLBACwIvFiLE/HG2f2oXtWPE9jsofaG7LpABO1PqcatfgVEQCkRgCQxlpnXT0GoAVvU35Hvwdq40cHQGoEAKkRAKRGAJAaAUBqBACpEQCkJnEvEL56dr+M2nl07+gASI0AIDUCgNQIAFIjAEiNACA1AoDU0l0HOPtM6ozz8CN/h9ozuXv1HpvVDsBrShDRWl2zBUJqBAApbO1qNo8BMm+DWl9f4pHC29iU0AGQGgFAagQAqaW7DtCCe+7zoAMgNQKA1AgAUiMASI0AIDUCgNSaToPOfF165lswslCqp90d4Mh3u+75nle+m2DM9+SqODu/veuNLRBSkwwAXSAmxXmVDAAwS1MALA5MFVcLHGcxny3PPtABkJp0AOgCMSjPY3MAOD8PT1of/dzdAd4e5372slg9rM/D9xw/a73nr3ed7QqAVRdQbqHYZjVve+pU+hgAGM1NAOgCvniZr90B4GAYyvbWp5sOUIqfVSU7T/N0KACWXcDT4GZkOT9H6tJVB4A2j4vT4QBE7gKRzsNncbQe3XYAj6tNZF7n41QArM8IeR30aKzn4Uwduu0AlfXgZ+d9/E8HwLoLlOJ/ErxSGPez9ee+A1QKk5FJlPHuEgCFLlBKnElRpzLOPeouTAeoVCYnKpXx7bXodguAShcoZey7Z2aw/v1bVIq/p64dQC0EESfMgtpY9qyz7lsgpRCUEnPVmin6+KX4iqQ6iWrhVKZa+L3ncMhBsGqhqU6qGtVxGlFXw84CqYbg18/3R+Qvwj5Dba+/NKqeUmyB1tQQ8M3puiv+DEOvA6h2gaXMHUF5xV8aWUfDO8D1dr8oDfLWPf3LA2Xr+/5H/37L+dh7LWN0h55yJdhDJ6iUwjqCp883Y3sa7lYIxDDr2GxaADx1AeQxtQMQArSYeWZu+haIEOCZ2aelTY4BCAHWWFyTMTsIJgRYsrogaXoW6Hq7X3p/72sEkT//2ruWLK/Gm58G5VaE3Kx3AuYBKIUQZGVd/KWIBKAUQpCNQvGXInY3aA1B1pvTMlAp/EqmAyzRDWJSK/5SRANQCiGIRrH4SxEOQCmEIArV4i9F7BhgTQ2Bp9t4z7J+HqEX5cKvpDvAkofBxF9e5ku+AyzVQc3UDbzxUviVmw6w5G2Qs/A4L646wBLdQIfHwq/cBqAiCHY8F37lPgAVQZgnQuFXYQJQEYRxIhV+FS4AlecgPLvv/+w1giPPFES+IBk2AJXnIFiLXPhV+ABUy/ZNGLZlKPqlNAFYIgxfZSv6pZQBWMoahsxFv5Q+AEvRwxDxLM5ZBGDD92LxGAgK/jUC0GirmBSCQaFDTg3G0S+hWP53CiEDAAAAAAAAALj0G/4WBZx5PTtGAAAAAElFTkSuQmCC" alt="SEL" className="h-7 w-7 object-contain" />
            </div>
            <span className="font-display text-lg font-extrabold">SEL HRMS</span>
          </div>
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
