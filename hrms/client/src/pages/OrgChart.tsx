import { useEffect, useState } from 'react';
import { Network, Pencil, Plus, Trash2, ChevronDown, ChevronRight, Building2, FolderKanban } from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Field, Input, Modal, Select, Skeleton } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../store/auth';
import type { OrgNode } from '../types';

/*
 * Dynamic organization tree.
 *  - Collapsible nodes (chevron toggles children)
 *  - Admin per-node actions: add child member, edit, remove
 *  - Each card shows: name, designation, project, company
 *  - Removing a node promotes its children to the removed node's manager
 *  - Depth-based accent colours: MD level = saffron, management = cobalt,
 *    project managers = jade, team members = neutral
 */

const DEPTH_ACCENT = [
  'border-l-saffron-400',  // level 0 — Managing Director
  'border-l-cobalt-500',   // level 1 — CFO / CEO / management
  'border-l-jade-500',     // level 2 — project managers
  'border-l-mist-300 dark:border-l-ink-600', // level 3+ — team members
];

interface NodeForm { name: string; designation: string; project: string; company: string }
const emptyForm: NodeForm = { name: '', designation: '', project: '', company: 'Sharika Enterprises Limited' };

function MemberCard({ node, depth, isAdmin, collapsed, onToggle, onAdd, onEdit, onRemove }: {
  node: OrgNode; depth: number; isAdmin: boolean; collapsed: boolean;
  onToggle: () => void; onAdd: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const accent = DEPTH_ACCENT[Math.min(depth, DEPTH_ACCENT.length - 1)];
  return (
    <div className={`glass group relative flex min-w-[220px] max-w-[260px] items-start gap-3 !rounded-xl border-l-4 ${accent} px-3.5 py-3`}>
      {/* Collapse toggle */}
      {node.reports.length > 0 ? (
        <button onClick={onToggle} aria-label={collapsed ? 'Expand' : 'Collapse'}
          className="mt-0.5 rounded-md p-0.5 text-ink-600/50 hover:bg-mist-200 hover:text-cobalt-500 dark:hover:bg-ink-700">
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
      ) : <span className="w-[19px]" />}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight">{node.name}</p>
        <p className="truncate text-xs font-medium text-cobalt-500">{node.designation || '—'}</p>
        <div className="mt-1 space-y-0.5">
          {node.project && (
            <p className="flex items-center gap-1 truncate text-[10.5px] text-ink-600/60 dark:text-mist-300/50">
              <FolderKanban size={10} className="shrink-0" /> {node.project}
            </p>
          )}
          <p className="flex items-center gap-1 truncate text-[10.5px] text-ink-600/60 dark:text-mist-300/50">
            <Building2 size={10} className="shrink-0" /> {node.company || 'Sharika Enterprises Limited'}
          </p>
        </div>
        {node.reports.length > 0 && (
          <p className="mt-1 text-[10px] font-semibold text-ink-600/40 dark:text-mist-300/30">
            {node.reports.length} report{node.reports.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Admin actions — appear on hover */}
      {isAdmin && (
        <div className="absolute -right-2 -top-2 hidden gap-1 group-hover:flex">
          <button onClick={onAdd} title="Add member under this node" aria-label={`Add member under ${node.name}`}
            className="rounded-full bg-jade-500 p-1.5 text-white shadow-md hover:bg-jade-600">
            <Plus size={12} />
          </button>
          <button onClick={onEdit} title="Edit member" aria-label={`Edit ${node.name}`}
            className="rounded-full bg-cobalt-500 p-1.5 text-white shadow-md hover:bg-cobalt-600">
            <Pencil size={12} />
          </button>
          {node.role !== 'admin' && (
            <button onClick={onRemove} title="Remove from tree" aria-label={`Remove ${node.name}`}
              className="rounded-full bg-coral-500 p-1.5 text-white shadow-md hover:bg-coral-600">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TreeNode({ node, depth, isAdmin, collapsedSet, onToggle, onAdd, onEdit, onRemove }: {
  node: OrgNode; depth: number; isAdmin: boolean; collapsedSet: Set<number>;
  onToggle: (id: number) => void; onAdd: (n: OrgNode) => void; onEdit: (n: OrgNode) => void; onRemove: (n: OrgNode) => void;
}) {
  const collapsed = collapsedSet.has(node.id);
  return (
    <div className="flex flex-col items-center">
      <MemberCard node={node} depth={depth} isAdmin={isAdmin} collapsed={collapsed}
        onToggle={() => onToggle(node.id)} onAdd={() => onAdd(node)} onEdit={() => onEdit(node)} onRemove={() => onRemove(node)} />
      {node.reports.length > 0 && !collapsed && (
        <>
          <div className="h-6 w-px bg-mist-300 dark:bg-ink-600" />
          <div className="flex items-start">
            {node.reports.map((child, i) => (
              <div key={child.id} className="flex flex-col items-center px-3">
                <div className="relative h-6 w-full">
                  <div className="absolute left-1/2 h-full w-px -translate-x-1/2 bg-mist-300 dark:bg-ink-600" />
                  {node.reports.length > 1 && (
                    <div className={`absolute top-0 h-px bg-mist-300 dark:bg-ink-600
                      ${i === 0 ? 'left-1/2 right-[-0.75rem]' : i === node.reports.length - 1 ? 'left-[-0.75rem] right-1/2' : 'left-[-0.75rem] right-[-0.75rem]'}`} />
                  )}
                </div>
                <TreeNode node={child} depth={depth + 1} isAdmin={isAdmin} collapsedSet={collapsedSet}
                  onToggle={onToggle} onAdd={onAdd} onEdit={onEdit} onRemove={onRemove} />
              </div>
            ))}
          </div>
        </>
      )}
      {node.reports.length > 0 && collapsed && (
        <button onClick={() => onToggle(node.id)}
          className="mt-1 rounded-full bg-mist-200 px-2 py-0.5 text-[10px] font-bold text-ink-600/60 hover:bg-mist-300 dark:bg-ink-700 dark:text-mist-300/60">
          +{node.reports.length} hidden
        </button>
      )}
    </div>
  );
}

export default function OrgChart() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const [roots, setRoots] = useState<OrgNode[] | null>(null);
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(new Set());
  const [flat, setFlat] = useState<{ id: number; name: string }[]>([]);

  // Modals
  const [addUnder, setAddUnder] = useState<OrgNode | null>(null);
  const [editing, setEditing] = useState<OrgNode | null>(null);
  const [removing, setRemoving] = useState<OrgNode | null>(null);
  const [form, setForm] = useState<NodeForm>(emptyForm);
  const [editManagerId, setEditManagerId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = () =>
    api<{ roots: OrgNode[] }>('/org/chart').then((d) => {
      setRoots(d.roots);
      const f: { id: number; name: string }[] = [];
      const walk = (n: OrgNode) => { f.push({ id: n.id, name: n.name }); n.reports.forEach(walk); };
      d.roots.forEach(walk);
      setFlat(f);
    }).catch((e) => toast('error', e.message));

  useEffect(() => { load(); }, []);

  const toggle = (id: number) =>
    setCollapsedSet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ---- Add member under a node ----
  const openAdd = (node: OrgNode) => { setForm(emptyForm); setCreated(null); setAddUnder(node); };
  const submitAdd = async () => {
    if (!addUnder) return;
    setBusy(true);
    try {
      const res = await api<{ member: { email: string; tempPassword: string } }>('/org/node', {
        method: 'POST',
        body: JSON.stringify({ ...form, managerId: addUnder.id }),
      });
      toast('success', `${form.name} added under ${addUnder.name}.`);
      setCreated(res.member);
      load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  // ---- Edit member ----
  const openEdit = (node: OrgNode) => {
    setForm({ name: node.name, designation: node.designation || '', project: (node as any).project || '', company: (node as any).company || 'Sharika Enterprises Limited' });
    setEditManagerId(node.manager_id ? String(node.manager_id) : '');
    setEditing(node);
  };
  const submitEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api(`/org/node/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, managerId: editManagerId ? Number(editManagerId) : null }),
      });
      toast('success', `${form.name} updated.`);
      setEditing(null);
      load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  // ---- Remove member ----
  const submitRemove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await api<{ promoted: number }>(`/org/node/${removing.id}`, { method: 'DELETE' });
      toast('success', `${removing.name} removed.${res.promoted ? ` ${res.promoted} report(s) moved up one level.` : ''}`);
      setRemoving(null);
      load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const FormFields = (
    <div className="space-y-3">
      <Field label="Full name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rajesh Kumar" /></Field>
      <Field label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Project Manager / SCADA Engineer" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project"><Input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="e.g. SCADA Modernisation" /></Field>
        <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-rise">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
          <Network size={22} className="text-cobalt-500" /> Organization tree
        </h1>
        <p className="text-sm text-ink-600/70 dark:text-mist-300/60">
          {isAdmin
            ? 'Hover a card for actions: add a member below it, edit details, or remove. Chevrons collapse branches.'
            : 'Company hierarchy — tap the chevrons to expand or collapse teams.'}
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-ink-600/60 dark:text-mist-300/50">
        <span className="flex items-center gap-1.5"><i className="h-3 w-1 rounded bg-saffron-400" /> Managing Director</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-1 rounded bg-cobalt-500" /> Management (CFO / CEO)</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-1 rounded bg-jade-500" /> Project managers</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-1 rounded bg-mist-300 dark:bg-ink-600" /> Team members</span>
      </div>

      <Card className="overflow-x-auto !p-6">
        {roots === null && <Skeleton className="h-64" />}
        {roots?.length === 0 && <p className="text-sm text-ink-600/60">No active members. {isAdmin && 'Add employees from the Employees page first.'}</p>}
        <div className="flex min-w-max flex-col items-center gap-10">
          {roots?.map((root) => (
            <TreeNode key={root.id} node={root} depth={0} isAdmin={!!isAdmin} collapsedSet={collapsedSet}
              onToggle={toggle} onAdd={openAdd} onEdit={openEdit} onRemove={setRemoving} />
          ))}
        </div>
      </Card>

      {/* ---- Add member modal ---- */}
      <Modal open={!!addUnder} onClose={() => setAddUnder(null)} title={`Add member under ${addUnder?.name || ''}`}>
        {!created ? (
          <div className="space-y-4">
            <p className="text-xs text-ink-600/60 dark:text-mist-300/50">
              The new member is created as an employee account reporting to <strong>{addUnder?.name}</strong>.
              An email and temporary password are generated automatically.
            </p>
            {FormFields}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddUnder(null)}>Cancel</Button>
              <Button loading={busy} onClick={submitAdd} disabled={!form.name || !form.designation}>Add member</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">Member created. Share these sign-in details with them:</p>
            <div className="glass !rounded-xl p-3 font-mono text-sm">
              <p>Email: <strong>{created.email}</strong></p>
              <p>Password: <strong>{created.tempPassword}</strong></p>
            </div>
            <p className="text-xs text-ink-600/60 dark:text-mist-300/50">Ask them to change the password from Profile after first sign-in.</p>
            <div className="flex justify-end">
              <Button onClick={() => setAddUnder(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Edit member modal ---- */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit — ${editing?.name || ''}`}>
        <div className="space-y-4">
          {FormFields}
          <Field label="Reports to" hint="Circular reporting is blocked automatically.">
            <Select value={editManagerId} onChange={(e) => setEditManagerId(e.target.value)}>
              <option value="">No manager (top of tree)</option>
              {flat.filter((f) => f.id !== editing?.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={busy} onClick={submitEdit}>Save changes</Button>
          </div>
        </div>
      </Modal>

      {/* ---- Remove confirmation ---- */}
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove member">
        <div className="space-y-4">
          <p className="text-sm">
            Remove <strong>{removing?.name}</strong> ({removing?.designation}) from the organization?
          </p>
          {removing && removing.reports.length > 0 && (
            <p className="rounded-xl bg-saffron-400/10 p-3 text-xs text-saffron-600">
              {removing.reports.length} member(s) currently report to {removing.name}. They will be moved up to report to {removing.name}'s manager.
            </p>
          )}
          <p className="rounded-xl bg-coral-500/10 p-3 text-xs text-coral-500">
            This deletes their employee account, attendance history, and leave records permanently.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={submitRemove}>Remove permanently</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
