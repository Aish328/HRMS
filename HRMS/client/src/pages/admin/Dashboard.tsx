import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, Plane, Hourglass, Clock } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts';
import { api } from '../../api/client';
import { Card, Skeleton } from '../../components/ui';
import { useToast } from '../../components/Toast';

interface Summary {
  totalEmployees: number; present: number; absent: number; onLeave: number;
  pendingLeaves: number; avgWorkingHours: number;
  trend: { date: string; present: number; onLeave: number }[];
  departments: { name: string; headcount: number; present: number }[];
}

function Metric({ icon: Icon, label, value, tone, sub }: {
  icon: any; label: string; value: number | string; tone: string; sub?: string;
}) {
  return (
    <Card className="group relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${tone} opacity-10 transition-transform duration-300 group-hover:scale-125`} />
      <div className={`mb-3 inline-flex rounded-xl p-2.5 ${tone} bg-opacity-15 dark:bg-opacity-20`}>
        <Icon size={20} className="text-current" />
      </div>
      <p className="font-display text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-ink-600/70 dark:text-mist-300/60">{label}</p>
      {sub && <p className="mt-1 text-xs text-ink-600/50 dark:text-mist-300/40">{sub}</p>}
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const toast = useToast();

  useEffect(() => {
    api<Summary>('/dashboard/summary').then(setData).catch((e) => toast('error', e.message));
  }, []);

  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
      </div>
    );
  }

  const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Today at a glance</h1>
        <p className="text-sm text-ink-600/70 dark:text-mist-300/60">Live headcount, presence and leave activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Total employees" value={data.totalEmployees} tone="bg-cobalt-500 text-cobalt-500" />
        <Metric icon={UserCheck} label="Present today" value={data.present} tone="bg-jade-500 text-jade-500"
          sub={`${data.totalEmployees ? Math.round((data.present / data.totalEmployees) * 100) : 0}% of workforce`} />
        <Metric icon={UserX} label="Absent" value={data.absent} tone="bg-coral-500 text-coral-500" />
        <Metric icon={Plane} label="On approved leave" value={data.onLeave} tone="bg-saffron-500 text-saffron-500" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display font-bold">Attendance — last 14 days</h2>
            <span className="text-xs text-ink-600/60 dark:text-mist-300/50">Present vs on leave</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={data.trend} margin={{ left: -20, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2952E3" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2952E3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={fmtDay} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }} />
                <Area type="monotone" dataKey="present" name="Present" stroke="#2952E3" strokeWidth={2.5} fill="url(#gPresent)" />
                <Area type="monotone" dataKey="onLeave" name="On leave" stroke="#F0A020" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          <Metric icon={Hourglass} label="Pending leave requests" value={data.pendingLeaves} tone="bg-saffron-500 text-saffron-500" sub="Waiting for your decision" />
          <Metric icon={Clock} label="Avg hours / day" value={data.avgWorkingHours} tone="bg-cobalt-500 text-cobalt-500" sub="This month, punched-out days" />
        </div>
      </div>

      <Card>
        <h2 className="mb-4 font-display font-bold">Presence by department — today</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={data.departments} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }} />
              <Legend />
              <Bar dataKey="headcount" name="Headcount" fill="#CBD4E3" radius={[6, 6, 0, 0]} />
              <Bar dataKey="present" name="Present" fill="#2952E3" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
