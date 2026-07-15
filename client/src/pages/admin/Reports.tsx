import { useState } from 'react';
import { FileDown, FileText, Table2 } from 'lucide-react';
import { downloadFile } from '../../api/client';
import { Button, Card, Field, Input } from '../../components/ui';
import { useToast } from '../../components/Toast';

const monthAgo = () => {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

export default function Reports() {
  const toast = useToast();
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState<string | null>(null);

  const grab = async (key: string, path: string, filename: string) => {
    setBusy(key);
    try {
      await downloadFile(path, filename);
      toast('success', 'Report downloaded.');
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5 animate-rise">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Reports</h1>
        <p className="text-sm text-ink-600/70 dark:text-mist-300/60">Export attendance and leave data for payroll or audits.</p>
      </div>

      <Card>
        <h2 className="mb-4 font-display font-bold">Attendance report</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-md">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button loading={busy === 'att-csv'}
            onClick={() => grab('att-csv', `/reports/attendance.csv?from=${from}&to=${to}`, `attendance_${from}_${to}.csv`)}>
            <Table2 size={16} /> Download CSV
          </Button>
          <Button variant="secondary" loading={busy === 'att-pdf'}
            onClick={() => grab('att-pdf', `/reports/attendance.pdf?from=${from}&to=${to}`, `attendance_${from}_${to}.pdf`)}>
            <FileText size={16} /> Download PDF
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-display font-bold">Leave report</h2>
        <p className="mb-4 text-sm text-ink-600/70 dark:text-mist-300/60">Every leave request with dates, days, status and reason.</p>
        <Button loading={busy === 'leave-csv'}
          onClick={() => grab('leave-csv', '/reports/leaves.csv', 'leave_report.csv')}>
          <FileDown size={16} /> Download CSV
        </Button>
      </Card>
    </div>
  );
}
