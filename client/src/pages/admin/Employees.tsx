import { FormEvent, useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Pagination, Select, Skeleton } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useDebounce } from '../../hooks/useDebounce';
import type { Department, User } from '../../types';

const empty = {
  name: '', email: '', employeeCode: '', departmentId: '' as string | number,
  designation: '', phone: '', joinDate: '', status: 'active' as 'active' | 'inactive', password: '',
};

export default function Employees() {
  const toast = useToast();
  const [rows, setRows] = useState<User[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q);
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const [modal, setModal] = useState<null | { mode: 'add' } | { mode: 'edit'; user: User }>(null);
  const [form, setForm] = useState(empty);
  const [formErr, setFormErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  const load = async () => {
    try {
      const params = new URLSearchParams({ q: debouncedQ, department, page: String(page), pageSize: String(pageSize) });
      const data = await api<{ employees: User[]; total: number }>(`/employees?${params}`);
      setRows(data.employees);
      setTotal(data.total);
    } catch (e: any) { toast('error', e.message); }
  };

  useEffect(() => { setPage(1); }, [debouncedQ, department]);
  useEffect(() => { load(); }, [debouncedQ, department, page]);
  useEffect(() => {
    api<{ departments: Department[] }>('/employees/departments').then((d) => setDepartments(d.departments)).catch(() => {});
  }, []);

  const openAdd = () => { setForm(empty); setFormErr({}); setModal({ mode: 'add' }); };
  const openEdit = (u: User) => {
    setForm({
      name: u.name, email: u.email, employeeCode: u.employeeCode,
      departmentId: u.departmentId ?? '', designation: u.designation || '',
      phone: u.phone || '', joinDate: u.joinDate || '', status: u.status, password: '',
    });
    setFormErr({});
    setModal({ mode: 'edit', user: u });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Name must be at least 2 characters.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address.';
    if (form.employeeCode.trim().length < 2) e.employeeCode = 'Employee code is required.';
    if (form.password && form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    setFormErr(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !modal) return;
    setBusy(true);
    const payload: any = {
      ...form,
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      password: form.password || undefined,
    };
    try {
      if (modal.mode === 'add') {
        const res = await api<{ initialPassword?: string }>('/employees', { method: 'POST', body: JSON.stringify(payload) });
        toast('success', res.initialPassword
          ? `Employee added. Temporary password: ${res.initialPassword}`
          : 'Employee added.');
      } else {
        await api(`/employees/${modal.user.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('success', 'Employee updated.');
      }
      setModal(null);
      load();
    } catch (err: any) { toast('error', err.message); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await api(`/employees/${confirmDelete.id}`, { method: 'DELETE' });
      toast('success', `${confirmDelete.name} removed.`);
      setConfirmDelete(null);
      load();
    } catch (e: any) { toast('error', e.message); }
  };

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Employees</h1>
          <p className="text-sm text-ink-600/70 dark:text-mist-300/60">Add, edit and organise your people.</p>
        </div>
        <Button onClick={openAdd}><Plus size={16} /> Add employee</Button>
      </div>

      <Card className="!p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-600/40" />
            <Input className="!pl-10" placeholder="Search name, email or code…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="sm:w-56" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-mist-200 text-xs uppercase tracking-wide text-ink-600/60 dark:border-ink-700 dark:text-mist-300/50">
                <th className="px-5 py-3.5">Employee</th>
                <th className="px-5 py-3.5">Code</th>
                <th className="px-5 py-3.5">Department</th>
                <th className="px-5 py-3.5">Designation</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-5 py-3"><Skeleton className="h-9" /></td></tr>
              ))}
              {rows?.map((u) => (
                <tr key={u.id} className="border-b border-mist-200/60 transition hover:bg-mist-100/60 dark:border-ink-700/60 dark:hover:bg-ink-700/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cobalt-400/15 font-display text-sm font-bold text-cobalt-500">
                        {u.name[0]}
                      </div>
                      <div>
                        <p className="font-semibold">{u.name}</p>
                        <p className="text-xs text-ink-600/60 dark:text-mist-300/50">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{u.employeeCode}</td>
                  <td className="px-5 py-3">{u.department || '—'}</td>
                  <td className="px-5 py-3">{u.designation || '—'}</td>
                  <td className="px-5 py-3"><Badge tone={u.status}>{u.status}</Badge></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(u)} aria-label={`Edit ${u.name}`}
                        className="rounded-lg p-2 text-ink-600/70 hover:bg-mist-200 hover:text-cobalt-500 dark:text-mist-300/70 dark:hover:bg-ink-700"><Pencil size={15} /></button>
                      <button onClick={() => setConfirmDelete(u)} aria-label={`Delete ${u.name}`}
                        className="rounded-lg p-2 text-ink-600/70 hover:bg-coral-400/10 hover:text-coral-500 dark:text-mist-300/70"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows?.length === 0 && <EmptyState title="No employees match" hint="Try a different search or clear the department filter." />}
        <div className="px-5 pb-4">
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </div>
      </Card>

      {/* Add / edit modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'edit' ? 'Edit employee' : 'Add employee'}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={formErr.name}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Employee code" error={formErr.employeeCode}>
            <Input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} placeholder="EMP009" />
          </Field>
          <Field label="Work email" error={formErr.email}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Department">
            <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Designation">
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          </Field>
          <Field label="Join date">
            <Input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label={modal?.mode === 'edit' ? 'Reset password (optional)' : 'Password (optional)'}
              error={formErr.password}
              hint={modal?.mode === 'add' ? 'Leave blank to auto-assign "welcome123".' : 'Leave blank to keep the current password.'}>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>{modal?.mode === 'edit' ? 'Save changes' : 'Add employee'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete employee">
        <p className="text-sm">
          This removes <strong>{confirmDelete?.name}</strong> and all of their attendance and leave records. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Keep employee</Button>
          <Button variant="danger" onClick={remove}>Delete permanently</Button>
        </div>
      </Modal>
    </div>
  );
}
