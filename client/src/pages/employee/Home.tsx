import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sunrise, Sunset, Timer, CalendarDays, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, Card, Skeleton } from '../../components/ui';
import { useAuth } from '../../store/auth';
import type { AttendanceRecord, Leave } from '../../types';
import AttendanceCalendar from '../../components/AttendanceCalendar';
import { ManagerPanel } from '../../components/LeaveWorkflow';

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

/* The "workday arc": punch-in rises at the left horizon, punch-out sets at the
   right. The sun travels the meridian as the day progresses — this is the
   product's signature element. */
function WorkdayArc({ record }: { record: AttendanceRecord | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const target = 8.5 * 60; // standard workday, minutes
  let progress = 0;
  if (record) {
    const worked = record.punch_out_at
      ? record.working_minutes ?? 0
      : (Date.now() - new Date(record.punch_in_at).getTime()) / 60000;
    progress = Math.min(1, worked / target);
  }

  // Semicircle from (20,110) to (220,110), radius 100
  const angle = Math.PI * (1 - progress);
  const sunX = 120 + 100 * Math.cos(angle);
  const sunY = 110 - 100 * Math.sin(angle);
  const done = !!record?.punch_out_at;

  return (
    <div className="relative">
      <svg viewBox="0 0 240 130" className="w-full">
        <defs>
          <linearGradient id="arcTrail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F0A020" />
            <stop offset="100%" stopColor="#2952E3" />
          </linearGradient>
        </defs>
        <path d="M 20 110 A 100 100 0 0 1 220 110" fill="none"
          className="stroke-mist-200 dark:stroke-ink-700" strokeWidth="6" strokeLinecap="round" />
        <path d="M 20 110 A 100 100 0 0 1 220 110" fill="none" stroke="url(#arcTrail)"
          strokeWidth="6" strokeLinecap="round" pathLength={100}
          strokeDasharray={`${progress * 100} 100`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)' }} />
        {record && (
          <g style={{ transition: 'transform 0.8s cubic-bezier(0.22,1,0.36,1)' }}>
            <circle cx={sunX} cy={sunY} r="9" fill={done ? '#17A57A' : '#F0A020'} />
            <circle cx={sunX} cy={sunY} r="9" fill={done ? '#17A57A' : '#F0A020'} opacity="0.4">
              {!done && <animate attributeName="r" values="9;15;9" dur="2.4s" repeatCount="indefinite" />}
              {!done && <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" />}
            </circle>
          </g>
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex justify-between px-1 text-xs text-ink-600/60 dark:text-mist-300/50">
        <span className="flex items-center gap-1"><Sunrise size={13} /> {fmtTime(record?.punch_in_at || null)}</span>
        <span className="flex items-center gap-1"><Sunset size={13} /> {fmtTime(record?.punch_out_at || null)}</span>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-6">
        {record ? (
          <>
            <p className="font-display text-2xl font-extrabold tabular-nums">
              {record.punch_out_at
                ? `${Math.floor((record.working_minutes || 0) / 60)}h ${(record.working_minutes || 0) % 60}m`
                : elapsed(record.punch_in_at)}
            </p>
            <p className="text-xs font-medium text-ink-600/60 dark:text-mist-300/50">
              {record.punch_out_at ? 'worked today — see you tomorrow' : 'on the clock'}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-bold text-ink-600/70 dark:text-mist-300/60">Not punched in</p>
            <p className="text-xs text-ink-600/50 dark:text-mist-300/40">Your day starts when you do</p>
          </>
        )}
      </div>
    </div>
  );
}

function elapsed(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function Home() {
  const { user } = useAuth();
  const [today, setToday] = useState<AttendanceRecord | null | undefined>(undefined);
  const [recent, setRecent] = useState<AttendanceRecord[] | null>(null);
  const [leaves, setLeaves] = useState<Leave[] | null>(null);
  const [me, setMe] = useState<{ pendingLeaves: number; upcomingHolidays: { date: string; name: string }[] } | null>(null);

  useEffect(() => {
    api<any>('/dashboard/me').then(setMe).catch(() => {});
    api<{ attendance: AttendanceRecord | null }>('/attendance/today').then((d) => setToday(d.attendance)).catch(() => setToday(null));
    api<{ records: AttendanceRecord[] }>('/attendance/mine?limit=5').then((d) => setRecent(d.records)).catch(() => setRecent([]));
    api<{ leaves: Leave[] }>('/leaves/mine').then((d) => setLeaves(d.leaves.slice(0, 3))).catch(() => setLeaves([]));
  }, []);

  const lb = user?.leaveBalance;

  return (
    <div className="space-y-4 animate-rise">
      <Card className="!pb-3">
        {today === undefined ? <Skeleton className="h-40" /> : <WorkdayArc record={today} />}
        {today !== undefined && (!today || !today.punch_out_at) && (
          <Link to="/app/punch"
            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-cobalt-500 py-3 text-sm font-bold text-white shadow-glow transition active:scale-[0.98]">
            <Timer size={16} /> {today ? 'Punch out' : 'Punch in'}
          </Link>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {(['casual', 'sick', 'earned'] as const).map((t) => (
          <Card key={t} className="!p-3.5 text-center">
            <p className="font-display text-xl font-extrabold tabular-nums">{lb?.[t] ?? '—'}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-600/60 dark:text-mist-300/50">{t} left</p>
          </Card>
        ))}
      </div>

      {me && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="!p-3.5 text-center">
            <p className="font-display text-xl font-extrabold tabular-nums">{me.pendingLeaves}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-600/60 dark:text-mist-300/50">Pending requests</p>
          </Card>
          <Card className="!p-3.5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600/60 dark:text-mist-300/50">Upcoming holidays</p>
            {me.upcomingHolidays.length === 0 && <p className="text-xs text-ink-600/50">None scheduled.</p>}
            {me.upcomingHolidays.slice(0, 2).map((h) => (
              <p key={h.date} className="text-xs">
                <strong>{new Date(h.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</strong>
                <span className="text-ink-600/60 dark:text-mist-300/50"> · {h.name}</span>
              </p>
            ))}
          </Card>
        </div>
      )}

      <ManagerPanel />

      <AttendanceCalendar refreshKey={today?.punch_out_at ? 2 : today ? 1 : 0} />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold">Recent leaves</h2>
          <Link to="/app/leaves" className="flex items-center text-xs font-semibold text-cobalt-500">
            All <ChevronRight size={14} />
          </Link>
        </div>
        {leaves === null && <Skeleton className="h-16" />}
        {leaves?.length === 0 && <p className="text-sm text-ink-600/60 dark:text-mist-300/50">No leave requests yet.</p>}
        <div className="space-y-2.5">
          {leaves?.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2.5">
                <CalendarDays size={16} className="shrink-0 text-saffron-500" />
                <div>
                  <p className="font-semibold capitalize">{l.type} · {l.days} day{l.days > 1 ? 's' : ''}</p>
                  <p className="text-xs text-ink-600/60 dark:text-mist-300/50">{l.start_date} → {l.end_date}</p>
                </div>
              </div>
              <Badge tone={l.status}>{l.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-sm font-bold">Recent activity</h2>
        {recent === null && <Skeleton className="h-20" />}
        {recent?.length === 0 && <p className="text-sm text-ink-600/60 dark:text-mist-300/50">Your punches will show up here.</p>}
        <div className="space-y-2.5">
          {recent?.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span className="font-medium">{new Date(r.work_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="text-xs text-ink-600/70 dark:text-mist-300/60 tabular-nums">
                {fmtTime(r.punch_in_at)} → {fmtTime(r.punch_out_at)}
                {r.working_minutes != null && <strong className="ml-2">{(r.working_minutes / 60).toFixed(1)}h</strong>}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
