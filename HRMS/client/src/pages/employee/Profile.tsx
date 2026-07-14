import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Building2, CalendarClock, KeyRound, LogOut, Mail, Phone } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, Field, Input, Modal, Skeleton } from '../../components/ui';
import { useAuth } from '../../store/auth';
import { useToast } from '../../components/Toast';
import type { AttendanceRecord } from '../../types';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ records: AttendanceRecord[] }>('/attendance/mine?limit=30')
      .then((d) => setRecords(d.records)).catch(() => setRecords([]));
  }, []);

  const summary = (() => {
    if (!records) return null;
    const complete = records.filter((r) => r.working_minutes != null);
    const totalMin = complete.reduce((s, r) => s + (r.working_minutes || 0), 0);
    return {
      days: records.length,
      avg: complete.length ? (totalMin / complete.length / 60).toFixed(1) : '—',
      total: (totalMin / 60).toFixed(0),
    };
  })();

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next.length < 8) { toast('error', 'New password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify(pw) });
      toast('success', 'Password updated.');
      setPwOpen(false);
      setPw({ current: '', next: '' });
    } catch (err: any) { toast('error', err.message); }
    finally { setBusy(false); }
  };

  const rows = [
    { icon: Mail, label: 'Email', value: user?.email },
    { icon: Phone, label: 'Phone', value: user?.phone || '—' },
    { icon: Building2, label: 'Department', value: user?.department || '—' },
    { icon: Briefcase, label: 'Designation', value: user?.designation || '—' },
    { icon: CalendarClock, label: 'Joined', value: user?.joinDate || '—' },
  ];

  return (
    <div className="space-y-4 animate-rise">
      <Card className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cobalt-500 font-display text-2xl font-extrabold text-white">
          {user?.name?.[0]}
        </div>
        <div>
          <p className="font-display text-lg font-bold leading-tight">{user?.name}</p>
          <p className="text-sm text-ink-600/60 dark:text-mist-300/50">{user?.employeeCode}</p>
        </div>
      </Card>

      <Card className="!p-0 divide-y divide-mist-200/70 dark:divide-ink-700/60">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-5 py-3.5 text-sm">
            <Icon size={17} className="text-cobalt-500" />
            <span className="w-24 text-ink-600/60 dark:text-mist-300/50">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-sm font-bold">Attendance — last 30 days</h2>
        {!summary ? <Skeleton className="h-14" /> : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="font-display text-xl font-extrabold tabular-nums">{summary.days}</p><p className="text-[11px] text-ink-600/60 dark:text-mist-300/50">days present</p></div>
            <div><p className="font-display text-xl font-extrabold tabular-nums">{summary.avg}h</p><p className="text-[11px] text-ink-600/60 dark:text-mist-300/50">avg / day</p></div>
            <div><p className="font-display text-xl font-extrabold tabular-nums">{summary.total}h</p><p className="text-[11px] text-ink-600/60 dark:text-mist-300/50">total hours</p></div>
          </div>
        )}
      </Card>

      <Card className="space-y-2 !p-4">
        <button onClick={() => setPwOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-mist-100 dark:hover:bg-ink-700/60">
          <KeyRound size={17} className="text-saffron-500" /> Change password
        </button>
        <button onClick={() => { logout(); navigate('/login'); }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-coral-500 hover:bg-coral-400/10">
          <LogOut size={17} /> Sign out
        </button>
      </Card>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Change password">
        <form onSubmit={changePw} className="space-y-4">
          <Field label="Current password">
            <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Button type="submit" loading={busy} className="w-full">Update password</Button>
        </form>
      </Modal>
    </div>
  );
}
