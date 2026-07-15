import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, ShieldCheck, ShieldAlert, Settings } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Pagination, Select, Skeleton } from '../../components/ui';
import { SelfieImage } from '../../components/shared';
import { useToast } from '../../components/Toast';
import { useDebounce } from '../../hooks/useDebounce';
import type { AttendanceRecord, Department } from '../../types';

// Import Leaflet CSS through the bundler so it always loads with correct asset paths
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet's default icon paths broken by Vite bundling
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
  shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
});

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtHours = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`);
const today = () => new Date().toISOString().slice(0, 10);

interface GeoFence { lat: number; lng: number; radiusM: number }

function AttendanceMap({ records, fence }: { records: AttendanceRecord[]; fence: GeoFence | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fenceRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    // Initialise map only once
    if (!mapRef.current) {
      mapRef.current = L.map(ref.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView([28.5097, 77.3813], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Remove old fence circle before re-drawing
    if (fenceRef.current) { fenceRef.current.remove(); fenceRef.current = null; }

    // Draw geofence circle
    if (fence) {
      fenceRef.current = L.circle([fence.lat, fence.lng], {
        radius: fence.radiusM,
        color: '#2952E3',
        fillColor: '#2952E3',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '6 4',
      }).addTo(map);

      // Office marker (pin)
      L.circleMarker([fence.lat, fence.lng], {
        radius: 6,
        color: '#2952E3',
        fillColor: '#2952E3',
        fillOpacity: 1,
        weight: 2,
      }).bindPopup('<b>Office</b><br/>Punch-in zone centre').addTo(map);
    }

    // Employee punch markers
    const layer = L.layerGroup().addTo(map);
    const points: L.LatLngExpression[] = [];
    records.forEach((r) => {
      if (r.punch_in_lat != null && r.punch_in_lng != null) {
        const p: L.LatLngExpression = [r.punch_in_lat, r.punch_in_lng];
        points.push(p);
        L.circleMarker(p, {
          radius: 8,
          color: '#17A57A',
          fillColor: '#17A57A',
          fillOpacity: 0.75,
          weight: 2,
        })
          .bindPopup(
            `<b>${r.name}</b><br/>In: ${fmtTime(r.punch_in_at)}` +
            (r.punch_out_at ? `<br/>Out: ${fmtTime(r.punch_out_at)}` : '<br/><i>Still working</i>')
          )
          .addTo(layer);
      }
    });

    // Fit bounds — include fence circle centre if no punches yet
    if (points.length) {
      map.fitBounds(L.latLngBounds(points).pad(0.3));
    } else if (fence) {
      map.setView([fence.lat, fence.lng], 15);
    }

    // Force map to recalculate its size (fixes blank white tile issue)
    setTimeout(() => map.invalidateSize(), 100);

    return () => { layer.remove(); };
  }, [records, fence]);

  // Also invalidate size whenever the container becomes visible
  useEffect(() => {
    const observer = new ResizeObserver(() => { mapRef.current?.invalidateSize(); });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ height: '320px', width: '100%', zIndex: 0 }}
      aria-label="Map of punch-in locations"
    />
  );
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
  const [fenceOpen, setFenceOpen] = useState(false);
  const [fence, setFence] = useState<GeoFence | null>(null);
  const [fenceForm, setFenceForm] = useState({ lat: '28.5097', lng: '77.3813', radiusM: '200' });
  const [fenceErr, setFenceErr] = useState<Record<string, string>>({});

  // Load saved fence from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('hrms.fence');
    if (saved) {
      try { setFence(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

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

  const saveFence = () => {
    const errs: Record<string, string> = {};
    const lat = parseFloat(fenceForm.lat);
    const lng = parseFloat(fenceForm.lng);
    const r = parseInt(fenceForm.radiusM);
    if (isNaN(lat) || lat < -90 || lat > 90) errs.lat = 'Enter a valid latitude (e.g. 28.4595).';
    if (isNaN(lng) || lng < -180 || lng > 180) errs.lng = 'Enter a valid longitude (e.g. 77.0266).';
    if (isNaN(r) || r < 50 || r > 5000) errs.radiusM = 'Radius must be between 50 and 5000 metres.';
    setFenceErr(errs);
    if (Object.keys(errs).length) return;
    const f = { lat, lng, radiusM: r };
    setFence(f);
    localStorage.setItem('hrms.fence', JSON.stringify(f));
    // Also send to server via env-style API (writes to .env and restarts geofence config)
    api('/attendance/geofence', { method: 'POST', body: JSON.stringify(f) }).catch(() => {});
    toast('success', `Geofence saved — ${r}m radius around ${lat.toFixed(4)}, ${lng.toFixed(4)}.`);
    setFenceOpen(false);
  };

  const openFenceModal = () => {
    setFenceForm({
      lat: fence ? String(fence.lat) : '',
      lng: fence ? String(fence.lng) : '',
      radiusM: fence ? String(fence.radiusM) : '200',
    });
    setFenceErr({});
    setFenceOpen(true);
  };

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Attendance</h1>
          <p className="text-sm text-ink-600/70 dark:text-mist-300/60">Punch records, locations and selfie verification.</p>
        </div>
        <Button variant="secondary" onClick={openFenceModal}>
          <Settings size={15} />
          {fence ? `Geofence · ${fence.radiusM}m` : 'Set geofence'}
        </Button>
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
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-700/80 dark:text-mist-200/80">
            <MapPin size={16} className="text-cobalt-500" />
            Punch-in locations · {date}
          </div>
          {fence && (
            <span className="text-xs text-cobalt-500 font-medium">
              ● Office zone active · {fence.radiusM}m radius
            </span>
          )}
        </div>
        <div className="p-4">
          {rows === null
            ? <Skeleton className="h-80" />
            : <AttendanceMap records={rows} fence={fence} />
          }
        </div>
        {!fence && (
          <div className="px-5 pb-4 text-xs text-ink-600/60 dark:text-mist-300/50">
            No geofence configured. Click "Set geofence" above to restrict punch-in to your office location.
          </div>
        )}
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

      {/* Geofence config modal */}
      <Modal open={fenceOpen} onClose={() => setFenceOpen(false)} title="Configure geofence">
        <div className="space-y-4">
          <p className="text-sm text-ink-600/70 dark:text-mist-300/60">
            Employees will only be able to punch in when their GPS location is within the radius you set.
            If they are outside this zone, their punch is rejected with an error.
          </p>
          <div className="glass !rounded-xl p-3 text-xs text-ink-600/70 dark:text-mist-300/60">
            <strong>How to find your office coordinates:</strong> Open Google Maps on your computer,
            right-click on your office building → the coordinates appear at the top of the menu
            (e.g. 28.5097, 77.3813). Copy them here.
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Office latitude" error={fenceErr.lat}>
              <Input
                type="number" step="0.0001" placeholder="e.g. 28.5097"
                value={fenceForm.lat} onChange={(e) => setFenceForm({ ...fenceForm, lat: e.target.value })}
              />
            </Field>
            <Field label="Office longitude" error={fenceErr.lng}>
              <Input
                type="number" step="0.0001" placeholder="e.g. 77.3813"
                value={fenceForm.lng} onChange={(e) => setFenceForm({ ...fenceForm, lng: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Allowed radius (metres)" error={fenceErr.radiusM}
            hint="100m is tight (inside the building). 200m covers the building + parking. 500m covers a campus.">
            <Input
              type="number" step="50" min="50" max="5000"
              value={fenceForm.radiusM} onChange={(e) => setFenceForm({ ...fenceForm, radiusM: e.target.value })}
            />
          </Field>
          <div className="flex justify-between gap-2">
            {fence && (
              <Button variant="ghost" className="text-coral-500" onClick={() => {
                setFence(null);
                localStorage.removeItem('hrms.fence');
                api('/attendance/geofence', { method: 'DELETE' }).catch(() => {});
                toast('info', 'Geofence removed. All locations can now punch in.');
                setFenceOpen(false);
              }}>Remove geofence</Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={() => setFenceOpen(false)}>Cancel</Button>
              <Button onClick={saveFence}>Save geofence</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Selfie review modal */}
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
              The score is a lightweight image-similarity check, not biometric identification. Low scores flag records for visual review.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
