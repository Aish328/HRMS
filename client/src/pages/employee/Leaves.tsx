import { FormEvent, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Skeleton, Textarea } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../store/auth';
import type { Leave } from '../../types';
import { ApprovalTimeline } from '../../components/LeaveWorkflow';

export default function Leaves() {
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [rows, setRows] = useState<Leave[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ type: 'casual', startDate: '', endDate: '', reason: '', halfDay: false, halfSession: 'first' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = () =>
    api<{ leaves: Leave[] }>('/leaves/mine').then((d) => setRows(d.leaves)).catch((e) => toast('error', e.message));
  useEffect(() => { load(); }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.startDate) e.startDate = 'Pick a start date.';
    if (!form.halfDay && !form.endDate) e.endDate = 'Pick an end date.';
    if (!form.halfDay && form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = 'End date must be on or after the start date.';
    if (form.reason.trim().length < 5) e.reason = 'Add a short reason (at least 5 characters).';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      // For a half-day, force end = start (single day).
      const payload = form.halfDay
        ? { ...form, endDate: form.startDate }
        : { type: form.type, startDate: form.startDate, endDate: form.endDate, reason: form.reason };
      await api('/leaves', { method: 'POST', body: JSON.stringify(payload) });
      toast('success', 'Leave request sent for approval.');
      setOpen(false);
      setForm({ type: 'casual', startDate: '', endDate: '', reason: '', halfDay: false, halfSession: 'first' });
      load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const cancel = async (id: number) => {
    try {
      await api(`/leaves/${id}/cancel`, { method: 'POST' });
      toast('success', 'Request cancelled.');
      load(); refresh();
    } catch (e: any) { toast('error', e.message); }
  };

  const lb = user?.leaveBalance;

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold">Leaves</h1>
        <Button className="!px-3.5 !py-2" onClick={() => setOpen(true)}><Plus size={16} /> Apply</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(['casual', 'sick', 'earned'] as const).map((t) => (
          <Card key={t} className="!p-3 text-center">
            <p className="font-display text-lg font-extrabold tabular-nums">{lb?.[t] ?? '—'}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-600/60 dark:text-mist-300/50">{t}</p>
          </Card>
        ))}
      </div>

      {rows === null && <Skeleton className="h-40" />}
      {rows?.length === 0 && <Card><EmptyState title="No leave requests yet" hint="Tap Apply to request your first leave." /></Card>}
      <div className="space-y-3">
        {rows?.map((l) => (
          <Card key={l.id} className="!p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold capitalize">{l.type} leave · {l.days} day{l.days > 1 ? 's' : ''}</p>
                <p className="text-xs text-ink-600/60 dark:text-mist-300/50">{l.start_date} → {l.end_date}</p>
              </div>
              <Badge tone={l.status}>{l.status}</Badge>
            </div>
            {l.reason && <p className="mt-2 text-sm text-ink-700/80 dark:text-mist-200/80">"{l.reason}"</p>}
            <ApprovalTimeline approvals={l.approvals} status={l.status} />
            {['pending', 'pending_hr', 'changes_requested'].includes(l.status) && (
              <button onClick={() => cancel(l.id)} className="mt-2.5 text-xs font-semibold text-coral-500">
                Cancel request
              </button>
            )}
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Apply for leave">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Leave type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="casual">Casual — CL ({lb?.casual ?? 0} left)</option>
              <option value="sick">Sick — SL ({lb?.sick ?? 0} left)</option>
              <option value="earned">Earned — EL ({lb?.earned ?? 0} left)</option>
              <option value="comp" disabled>Comp-Off — COL ({lb?.comp ?? 0} left) — coming soon</option>
              <option value="unpaid">Leave Without Pay — LOP</option>
            </Select>
          </Field>

          {/* Half-day toggle */}
          <label className="flex items-center gap-2.5 rounded-xl border border-mist-300 px-3.5 py-2.5 dark:border-ink-600">
            <input type="checkbox" checked={form.halfDay}
              onChange={(e) => setForm({ ...form, halfDay: e.target.checked })}
              className="h-4 w-4 accent-cobalt-500" />
            <span className="text-sm font-medium">Half-day leave</span>
          </label>

          {form.halfDay && (
            <Field label="Session">
              <Select value={form.halfSession} onChange={(e) => setForm({ ...form, halfSession: e.target.value })}>
                <option value="first">First session (morning)</option>
                <option value="second">Second session (afternoon)</option>
              </Select>
            </Field>
          )}

          {form.halfDay ? (
            <Field label="Date" error={errors.startDate}>
              <Input type="date" value={form.startDate} min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" error={errors.startDate}>
                <Input type="date" value={form.startDate} min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </Field>
              <Field label="To" error={errors.endDate}>
                <Input type="date" value={form.endDate} min={form.startDate || undefined}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label="Reason" error={errors.reason}>
            <Textarea placeholder="Why do you need this leave?" value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <Button type="submit" loading={busy} className="w-full">Send for approval</Button>
        </form>
      </Modal>
    </div>
  );
}
