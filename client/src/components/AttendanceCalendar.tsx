import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { Card, Skeleton } from './ui';
import type { CalendarDay } from '../types';

/*
 * Monthly attendance calendar.
 * Colour legend:
 *   blue        = full day worked
 *   half blue   = half day (diagonal split)
 *   red         = absent (working day, no punch)
 *   light grey  = weekend / holiday
 *   default     = future dates
 *   pulsing     = currently working (today, not punched out)
 */

const fmtT = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtH = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`);

const STATUS_LABEL: Record<string, string> = {
  full: 'Full day', half: 'Half day', absent: 'Absent',
  weekend: 'Weekend', holiday: 'Holiday', future: '', working: 'Working now',
};

function cellClasses(status: CalendarDay['status']): string {
  switch (status) {
    case 'full':    return 'bg-cobalt-500 text-white';
    case 'working': return 'bg-cobalt-400 text-white animate-pulse';
    case 'absent':  return 'bg-coral-500 text-white';
    case 'half':    return 'text-white'; // gradient applied inline
    case 'weekend':
    case 'holiday': return 'bg-mist-200 text-ink-600/50 dark:bg-ink-700 dark:text-mist-300/40';
    default:        return 'text-ink-600/60 dark:text-mist-300/40'; // future
  }
}

export default function AttendanceCalendar({ refreshKey = 0 }: { refreshKey?: number }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 }); // m: 1–12
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [tip, setTip] = useState<CalendarDay | null>(null);

  const monthStr = `${ym.y}-${String(ym.m).padStart(2, '0')}`;

  useEffect(() => {
    setDays(null);
    api<{ days: CalendarDay[]; percentage: number }>(`/attendance/calendar?month=${monthStr}`)
      .then((d) => { setDays(d.days); setPct(d.percentage); })
      .catch(() => setDays([]));
  }, [monthStr, refreshKey]);

  const move = (delta: number) => {
    setTip(null);
    setYm(({ y, m }) => {
      const nm = m + delta;
      if (nm < 1) return { y: y - 1, m: 12 };
      if (nm > 12) return { y: y + 1, m: 1 };
      return { y, m: nm };
    });
  };

  const firstDow = new Date(ym.y, ym.m - 1, 1).getDay(); // 0 = Sunday
  const monthName = new Date(ym.y, ym.m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">Attendance calendar</h2>
        {pct !== null && (
          <span className="rounded-full bg-cobalt-400/15 px-2.5 py-0.5 text-xs font-bold text-cobalt-600 dark:text-cobalt-300">
            {pct}% this month
          </span>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => move(-1)} aria-label="Previous month"
          className="rounded-lg p-1.5 hover:bg-mist-200 dark:hover:bg-ink-700"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold">{monthName}</span>
        <button onClick={() => move(1)} aria-label="Next month"
          className="rounded-lg p-1.5 hover:bg-mist-200 dark:hover:bg-ink-700"><ChevronRight size={16} /></button>
      </div>

      {days === null ? <Skeleton className="h-56" /> : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="pb-1 text-[10px] font-bold uppercase text-ink-600/50 dark:text-mist-300/40">{d}</div>
            ))}
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {days.map((d) => {
              const dayNum = Number(d.date.slice(-2));
              const isHalf = d.status === 'half';
              return (
                <button
                  key={d.date}
                  onMouseEnter={() => d.status !== 'future' && setTip(d)}
                  onMouseLeave={() => setTip(null)}
                  onClick={() => setTip(tip?.date === d.date ? null : d)}
                  className={`relative flex aspect-square items-center justify-center rounded-lg text-xs font-semibold transition-transform hover:scale-105 ${cellClasses(d.status)}`}
                  style={isHalf ? { background: 'linear-gradient(135deg, #2952E3 50%, #CBD4E3 50%)' } : undefined}
                  aria-label={`${d.date}: ${STATUS_LABEL[d.status] || 'Future'}`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Hover / tap detail */}
          {tip && (
            <div className="glass mt-3 !rounded-xl p-3 text-xs animate-rise">
              <div className="flex items-center justify-between">
                <strong>{new Date(tip.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</strong>
                <span className="font-semibold text-cobalt-500">{tip.holidayName || STATUS_LABEL[tip.status]}</span>
              </div>
              {(tip.punchIn || tip.punchOut) && (
                <div className="mt-1.5 flex gap-4 text-ink-600/70 dark:text-mist-300/60">
                  <span>In: <strong className="text-ink-900 dark:text-mist-100">{fmtT(tip.punchIn)}</strong></span>
                  <span>Out: <strong className="text-ink-900 dark:text-mist-100">{fmtT(tip.punchOut)}</strong></span>
                  <span>Hours: <strong className="text-ink-900 dark:text-mist-100">{fmtH(tip.workingMinutes)}</strong></span>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-ink-600/60 dark:text-mist-300/50">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-cobalt-500" /> Full day</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded" style={{ background: 'linear-gradient(135deg,#2952E3 50%,#CBD4E3 50%)' }} /> Half day</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-coral-500" /> Absent</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-mist-200 dark:bg-ink-700" /> Weekend / Holiday</span>
          </div>
        </>
      )}
    </Card>
  );
}
