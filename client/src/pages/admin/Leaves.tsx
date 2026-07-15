import { useEffect, useState } from 'react';
import { Search, Check, X } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Pagination, Select, Skeleton, Textarea } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useDebounce } from '../../hooks/useDebounce';
import type { Leave } from '../../types';
import { ApprovalTimeline } from '../../components/LeaveWorkflow';

export default function Leaves() {
  const toast = useToast();
  const [rows, setRows] = useState<Leave[] | null>(null);
  const [status, setStatus] = useState('pending_hr');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;
  const [decide, setDecide] = useState<{ leave: Leave; decision: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const params = new URLSearchParams({ status, q: debouncedQ, page: String(page), pageSize: String(pageSize) });
      const data = await api<{ leaves: Leave[]; total: number }>(`/leaves?${params}`);
      setRows(data.leaves);
      setTotal(data.total);
    } catch (e: any) { toast('error', e.message); }
  };

  useEffect(() => { setPage(1); }, [status, debouncedQ]);
  useEffect(() => { load(); }, [status, debouncedQ, page]);

  const submitDecision = async () => {
    if (!decide) return;
    setBusy(true);
    try {
      await api(`/leaves/${decide.leave.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: decide.decision, note }),
      });
      toast('success', `Leave ${decide.decision}.`);
      setDecide(null);
      setNote('');
      load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-rise">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Leave requests</h1>
        <p className="text-sm text-ink-600/70 dark:text-mist-300/60">Approve or reject requests. Balances update automatically.</p>
      </div>

      <Card className="!p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-600/40" />
            <Input className="!pl-10" placeholder="Search by employee…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending manager</option>
            <option value="pending_hr">Pending HR</option>
            <option value="changes_requested">Changes requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows === null && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        {rows?.map((l) => (
          <Card key={l.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{l.name}</p>
                <p className="text-xs text-ink-600/60 dark:text-mist-300/50">{l.employee_code}</p>
              </div>
              <Badge tone={l.status}>{l.status}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><span className="text-ink-600/60 dark:text-mist-300/50">Type:</span> <strong className="capitalize">{l.type}</strong></span>
              <span><span className="text-ink-600/60 dark:text-mist-300/50">Dates:</span> <strong>{l.start_date} → {l.end_date}</strong></span>
              <span><span className="text-ink-600/60 dark:text-mist-300/50">Days:</span> <strong>{l.days}</strong></span>
            </div>
            {l.reason && <p className="rounded-xl bg-mist-100 p-3 text-sm dark:bg-ink-700/60">"{l.reason}"</p>}
            {l.manager_name && (
              <p className="text-xs text-ink-600/60 dark:text-mist-300/50">
                Reporting manager: <strong>{l.manager_name}</strong>
                {l.status === 'pending' && ' — awaiting their approval first'}
              </p>
            )}
            <ApprovalTimeline approvals={l.approvals} status={l.status} />
            {l.status === 'pending_hr' && (
              <div className="mt-1 flex gap-2">
                <Button variant="success" className="flex-1" onClick={() => setDecide({ leave: l, decision: 'approved' })}>
                  <Check size={16} /> Approve
                </Button>
                <Button variant="danger" className="flex-1" onClick={() => setDecide({ leave: l, decision: 'rejected' })}>
                  <X size={16} /> Reject
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      {rows?.length === 0 && <Card><EmptyState title="No requests here" hint="Change the status filter to see other requests." /></Card>}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />

      <Modal open={!!decide} onClose={() => setDecide(null)}
        title={decide?.decision === 'approved' ? 'Approve leave' : 'Reject leave'}>
        <p className="text-sm">
          {decide?.decision === 'approved' ? 'Approve' : 'Reject'} <strong>{decide?.leave.name}</strong>'s {decide?.leave.type} leave
          from <strong>{decide?.leave.start_date}</strong> to <strong>{decide?.leave.end_date}</strong> ({decide?.leave.days} day{(decide?.leave.days || 0) > 1 ? 's' : ''})?
        </p>
        <div className="mt-4">
          <Field label="Note to employee (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for your decision…" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDecide(null)}>Cancel</Button>
          <Button variant={decide?.decision === 'approved' ? 'success' : 'danger'} loading={busy} onClick={submitDecision}>
            {decide?.decision === 'approved' ? 'Approve leave' : 'Reject leave'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
