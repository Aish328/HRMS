import { useEffect, useState } from 'react';
import { LogIn, Fingerprint, CalendarCheck2, UserCog, KeyRound, CircleDot } from 'lucide-react';
import { api } from '../../api/client';
import { Card, EmptyState, Skeleton } from '../../components/ui';
import { timeAgo } from '../../components/shared';
import { useToast } from '../../components/Toast';

interface Entry { id: number; name: string | null; action: string; detail: string | null; created_at: string }

const icons: Record<string, JSX.Element> = {
  login: <LogIn size={15} className="text-cobalt-500" />,
  punch_in: <Fingerprint size={15} className="text-jade-500" />,
  punch_out: <Fingerprint size={15} className="text-saffron-500" />,
  leave_apply: <CalendarCheck2 size={15} className="text-saffron-500" />,
  leave_decision: <CalendarCheck2 size={15} className="text-cobalt-500" />,
  employee_create: <UserCog size={15} className="text-jade-500" />,
  employee_update: <UserCog size={15} className="text-cobalt-500" />,
  employee_delete: <UserCog size={15} className="text-coral-500" />,
  password_change: <KeyRound size={15} className="text-saffron-500" />,
};

export default function Activity() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const toast = useToast();

  useEffect(() => {
    api<{ activity: Entry[] }>('/activity?limit=100')
      .then((d) => setRows(d.activity))
      .catch((e) => toast('error', e.message));
  }, []);

  return (
    <div className="space-y-5 animate-rise">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Activity log</h1>
        <p className="text-sm text-ink-600/70 dark:text-mist-300/60">Audit trail of sign-ins, punches, leaves and admin changes.</p>
      </div>
      <Card className="!p-0">
        {rows === null && <div className="space-y-3 p-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>}
        {rows?.length === 0 && <EmptyState title="No activity yet" />}
        <ul className="divide-y divide-mist-200/70 dark:divide-ink-700/60">
          {rows?.map((e) => (
            <li key={e.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist-100 dark:bg-ink-700">
                {icons[e.action] || <CircleDot size={15} className="text-ink-600/50" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm"><strong>{e.name || 'System'}</strong> · {e.detail || e.action}</p>
              </div>
              <span className="shrink-0 text-xs text-ink-600/50 dark:text-mist-300/40">{timeAgo(e.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
