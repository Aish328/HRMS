import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, MapPin, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, Button, Card, EmptyState, Input, Modal, Pagination, Select, Skeleton } from '../../components/ui';
import { SelfieImage } from '../../components/shared';
import { useToast } from '../../components/Toast';
import { useDebounce } from '../../hooks/useDebounce';
import type { AttendanceRecord, Department } from '../../types';

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtHours = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`);
const today = () => new Date().toISOString().slice(0, 10);

function AttendanceMap({ records }: { records: AttendanceRecord[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(ref.current, { scrollWheelZoom: false }).setView([28.45, 77.02], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapRef.current);
    }
    const map = mapRef.current;
    const layer = L.layerGroup().addTo(map);
    const points: L.LatLngExpression[] = [];
    records.forEach((r) => {
      if (r.punch_in_lat != null && r.punch_in_lng != null) {
        const p: L.LatLngExpression = [r.punch_in_lat, r.punch_in_lng];
        points.push(p);
        L.circleMarker(p, { radius: 8, color: '#2952E3', fillColor: '#2952E3', fillOpacity: 0.7, weight: 2 })
          .bindPopup(`<b>${r.name}</b><br/>In: ${fmtTime(r.punch_in_at)}${r.punch_out_at ? `<br/>Out: ${fmtTime(r.punch_out_at)}` : ''}`)
          .addTo(layer);
      }
    });
    if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.25));
    return () => { layer.remove(); };
  }, [records]);

  return <div ref={ref} className="h-72 w-full" aria-label="Map of punch-in locations" />;
}

export default function Attendance() {
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceRecord[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q);
  const [date, setDate] = useState(today());
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;
  const [detail, setDetail] = useState<AttendanceRecord | null>(null);

  const load = async () => {
    try {
      const params = new URLSearchParams({ q: debouncedQ, date, department, page: String(page), pageSize: String(pageSize) });
      const data = await api<{ records: AttendanceRecord[]; total: number }>(`/attendance?${params}`);
      setRows(data.records);
      setTotal(data.total);
    } catch (e: any) { toast('error', e.message); }
  };

  useEffect(() => { setPage(1); }, [debouncedQ, date, department]);
  useEffect(() => { load(); }, [debouncedQ, date, department, page]);
  useEffect(() => {
    api<{ departments: Department[] }>('/employees/departments').then((d) => setDepartments(d.departments)).catch(() => {});
  }, []);

  const matchBadge = (score: number | null) => {
    if (score == null) return <span className="text-xs text-ink-600/50">—</span>;
    const ok = score >= 0.55;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${ok ? 'text-jade-500' : 'text-coral-500'}`}>
        {ok ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
        {(score * 100).toFixed(0)}%
      </span>
    );
  };

  return (
    <div className="space-y-5 animate-rise">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Attendance</h1>
        <p className="text-sm text-ink-600/70 dark:text-mist-300/60">Punch records, locations and selfie verification.</p>
      </div>

      <Card className="!p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-600/40" />
            <Input className="!pl-10" placeholder="Search by name or code…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Input type="date" className="lg:w-44" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select className="lg:w-52" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-4 text-sm font-semibold text-ink-700/80 dark:text-mist-200/80">
          <MapPin size={16} className="text-cobalt-500" /> Punch-in locations · {date}
        </div>
        <div className="p-4">
          {rows === null ? <Skeleton className="h-72" /> : <AttendanceMap records={rows} />}
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-mist-200 text-xs uppercase tracking-wide text-ink-600/60 dark:border-ink-700 dark:text-mist-300/50">
                <th className="px-5 py-3.5">Employee</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Punch in</th>
                <th className="px-5 py-3.5">Punch out</th>
                <th className="px-5 py-3.5">Hours</th>
                <th className="px-5 py-3.5">Face match</th>
                <th className="px-5 py-3.5 text-right">Selfies</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-5 py-3"><Skeleton className="h-8" /></td></tr>
              ))}
              {rows?.map((r) => (
                <tr key={r.id} className="border-b border-mist-200/60 transition hover:bg-mist-100/60 dark:border-ink-700/60 dark:hover:bg-ink-700/30">
                  <td className="px-5 py-3">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-ink-600/60 dark:text-mist-300/50">{r.employee_code} · {r.department || '—'}</p>
                  </td>
                  <td className="px-5 py-3">{r.work_date}</td>
                  <td className="px-5 py-3">{fmtTime(r.punch_in_at)}</td>
                  <td className="px-5 py-3">{r.punch_out_at ? fmtTime(r.punch_out_at) : <Badge tone="info">Working</Badge>}</td>
                  <td className="px-5 py-3 tabular-nums">{fmtHours(r.working_minutes)}</td>
                  <td className="px-5 py-3">{matchBadge(r.face_match_score)}</td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setDetail(r)}>Review</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows?.length === 0 && <EmptyState title="No punches on this date" hint="Pick another date or clear the filters." />}
        <div className="px-5 pb-4">
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </div>
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Verification — ${detail?.name || ''}`} wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600/60 dark:text-mist-300/50">
                  Punch in · {fmtTime(detail.punch_in_at)}
                </p>
                <SelfieImage file={detail.punch_in_selfie} className="aspect-square w-full rounded-2xl" />
                {detail.punch_in_lat != null && (
                  <p className="mt-2 text-xs text-ink-600/60 dark:text-mist-300/50">
                    📍 {detail.punch_in_lat.toFixed(5)}, {detail.punch_in_lng?.toFixed(5)}
                  </p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600/60 dark:text-mist-300/50">
                  Punch out · {fmtTime(detail.punch_out_at)}
                </p>
                <SelfieImage file={detail.punch_out_selfie} className="aspect-square w-full rounded-2xl" />
                {detail.punch_out_lat != null && (
                  <p className="mt-2 text-xs text-ink-600/60 dark:text-mist-300/50">
                    📍 {detail.punch_out_lat.toFixed(5)}, {detail.punch_out_lng?.toFixed(5)}
                  </p>
                )}
              </div>
            </div>
            <div className="glass flex items-center justify-between !rounded-xl p-3 text-sm">
              <span className="font-semibold">Image similarity score</span>
              {matchBadge(detail.face_match_score)}
            </div>
            <p className="text-xs text-ink-600/60 dark:text-mist-300/50">
              The score is a lightweight image-similarity check, not biometric identification. Low scores flag records for the visual review you are doing here.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
