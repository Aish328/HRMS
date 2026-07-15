import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, CircleDot, Send, MessageSquareWarning, Users, CalendarCheck2 } from 'lucide-react';
import { api } from '../api/client';
import { Badge, Button, Card, Field, Modal, Skeleton, Textarea } from './ui';
import { useToast } from './Toast';
import type { Leave, LeaveApproval } from '../types';

/* ---------- Approval timeline (Submitted → Manager → HR) ---------- */
const actionIcon: Record<string, JSX.Element> = {
  submitted: <Send size={13} className="text-cobalt-500" />,
  approved: <CheckCircle2 size={13} className="text-jade-500" />,
  rejected: <XCircle size={13} className="text-coral-500" />,
  changes_requested: <MessageSquareWarning size={13} className="text-saffron-500" />,
  cancelled: <XCircle size={13} className="text-ink-600/40" />,
};

const roleLabel: Record<string, string> = { employee: '', manager: 'Manager', hr: 'HR' };

function fmtWhen(iso: string) {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ApprovalTimeline({ approvals, status }: { approvals?: LeaveApproval[]; status: Leave['status'] }) {
  if (!approvals?.length) return null;
  const steps = [...approvals];

  // Show what's still pending as a ghost step
  const pendingLabel =
    status === 'pending' ? 'Awaiting manager approval'
    : status === 'pending_hr' ? 'Awaiting HR approval'
    : null;

  return (
    <div className="mt-2 space-y-0">
      {steps.map((a, i) => (
        <div key={a.id} className="flex gap-2.5">
          <div className="flex flex-col items-center">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-mist-100 dark:bg-ink-700">
              {actionIcon[a.action] || <CircleDot size={13} />}
            </div>
            {(i < steps.length - 1 || pendingLabel) && <div className="w-px flex-1 bg-mist-300 dark:bg-ink-600" />}
          </div>
          <div className="pb-3 text-xs">
            <p className="font-semibold capitalize">
              {a.action === 'submitted' ? 'Submitted'
                : a.action === 'changes_requested' ? `Changes requested by ${roleLabel[a.actor_role]}`
                : `${a.action} by ${roleLabel[a.actor_role] || a.actor_role}`}
            </p>
            <p className="text-ink-600/60 dark:text-mist-300/50">
              {a.actor_name}{a.actor_designation ? ` · ${a.actor_designation}` : ''} · {fmtWhen(a.created_at)}
            </p>
            {a.comments && a.action !== 'submitted' && (
              <p className="mt-0.5 rounded-lg bg-mist-100 px-2 py-1 dark:bg-ink-700/60">"{a.comments}"</p>
            )}
          </div>
        </div>
      ))}
      {pendingLabel && (
        <div className="flex gap-2.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-mist-300 dark:border-ink-600">
            <CircleDot size={11} className="text-ink-600/30" />
          </div>
          <p className="text-xs italic text-ink-600/50 dark:text-mist-300/40">{pendingLabel}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Manager team panel (rendered on the employee home for managers) ---------- */
interface TeamData {
  isManager: boolean;
  team: { id: number; name: string; employee_code: string; designation: string | null; punch_in_at: string | null; punch_out_at: string | null }[];
  presentToday: number;
  pendingApprovals: number;
  onLeave: { name: string }[];
}

export function ManagerPanel() {
  const toast = useToast();
  const [data, setData] = useState<TeamData | null>(null);
  const [requests, setRequests] = useState<Leave[] | null>(null);
  const [decide, setDecide] = useState<{ leave: Leave; decision: 'approved' | 'rejected' | 'changes' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api<TeamData>('/dashboard/manager').then(setData).catch(() => setData(null));
    api<{ leaves: Leave[] }>('/leaves/team').then((d) => setRequests(d.leaves)).catch(() => setRequests([]));
  };
  useEffect(() => { load(); }, []);

  if (!data?.isManager) return null;

  const submit = async () => {
    if (!decide) return;
    setBusy(true);
    try {
      await api(`/leaves/${decide.leave.id}/manager-decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: decide.decision, note }),
      });
      const verb = decide.decision === 'approved' ? 'approved — forwarded to HR'
        : decide.decision === 'rejected' ? 'rejected' : 'sent back for changes';
      toast('success', `Request ${verb}.`);
      setDecide(null); setNote(''); load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const fmtT = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <Card className="border-l-4 !border-l-cobalt-500">
      <div className="mb-3 flex items-center gap-2">
        <Users size={16} className="text-cobalt-500" />
        <h2 className="font-display text-sm font-bold">Your team</h2>
        <span className="ml-auto text-xs text-ink-600/60 dark:text-mist-300/50">
          {data.presentToday}/{data.team.length} present today
          {data.onLeave.length > 0 && ` · ${data.onLeave.length} on leave`}
        </span>
      </div>

      {/* Team attendance today */}
      <div className="space-y-2">
        {data.team.map((t) => (
          <div key={t.id} className="flex items-center justify-between text-sm">
            <span className="font-medium">{t.name}</span>
            <span className="text-xs text-ink-600/60 dark:text-mist-300/50 tabular-nums">
              {t.punch_in_at
                ? `${fmtT(t.punch_in_at)} → ${fmtT(t.punch_out_at)}`
                : data.onLeave.some((l) => l.name === t.name) ? <Badge tone="pending">On leave</Badge> : <Badge tone="rejected">Not in</Badge>}
            </span>
          </div>
        ))}
      </div>

      {/* Pending approvals */}
      {requests === null && <Skeleton className="mt-3 h-16" />}
      {requests && requests.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-mist-200 pt-3 dark:border-ink-700">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-saffron-600">
            <CalendarCheck2 size={13} /> {requests.length} leave request{requests.length > 1 ? 's' : ''} awaiting you
          </p>
          {requests.map((l) => (
            <div key={l.id} className="rounded-xl bg-mist-100 p-3 dark:bg-ink-700/50">
              <div className="flex items-center justify-between text-sm">
                <strong>{l.name}</strong>
                <span className="text-xs capitalize text-ink-600/60 dark:text-mist-300/50">{l.type} · {l.days}d</span>
              </div>
              <p className="text-xs text-ink-600/60 dark:text-mist-300/50">{l.start_date} → {l.end_date}</p>
              {l.reason && <p className="mt-1 text-xs">"{l.reason}"</p>}
              <div className="mt-2 flex gap-1.5">
                <Button variant="success" className="flex-1 !px-2 !py-1.5 !text-xs" onClick={() => setDecide({ leave: l, decision: 'approved' })}>Approve</Button>
                <Button variant="danger" className="flex-1 !px-2 !py-1.5 !text-xs" onClick={() => setDecide({ leave: l, decision: 'rejected' })}>Reject</Button>
                <Button variant="secondary" className="flex-1 !px-2 !py-1.5 !text-xs" onClick={() => setDecide({ leave: l, decision: 'changes' })}>Changes</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!decide} onClose={() => setDecide(null)}
        title={decide?.decision === 'approved' ? 'Approve request' : decide?.decision === 'rejected' ? 'Reject request' : 'Request changes'}>
        <p className="text-sm">
          <strong>{decide?.leave.name}</strong> · {decide?.leave.type} leave, {decide?.leave.start_date} → {decide?.leave.end_date} ({decide?.leave.days}d)
        </p>
        {decide?.decision === 'approved' && (
          <p className="mt-1 text-xs text-ink-600/60 dark:text-mist-300/50">After your approval, HR gives the final decision.</p>
        )}
        <div className="mt-4">
          <Field label={decide?.decision === 'changes' ? 'What should they change?' : 'Note (optional)'}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={decide?.decision === 'changes' ? 'e.g. Move the dates after the release…' : 'Add context…'} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDecide(null)}>Cancel</Button>
          <Button variant={decide?.decision === 'approved' ? 'success' : decide?.decision === 'rejected' ? 'danger' : 'primary'} loading={busy} onClick={submit}>
            Confirm
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
