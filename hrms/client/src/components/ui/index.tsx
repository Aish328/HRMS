import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect } from 'react';
import { X, Inbox, Loader2 } from 'lucide-react';

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-cobalt-500 text-white hover:bg-cobalt-600 focus-visible:ring-cobalt-300',
  secondary: 'bg-white text-ink-800 border border-mist-300 hover:bg-mist-100 dark:bg-ink-700 dark:text-mist-100 dark:border-ink-600 dark:hover:bg-ink-600 focus-visible:ring-cobalt-300',
  ghost: 'text-ink-700 hover:bg-mist-200/70 dark:text-mist-200 dark:hover:bg-ink-700 focus-visible:ring-cobalt-300',
  danger: 'bg-coral-500 text-white hover:bg-coral-600 focus-visible:ring-coral-400',
  success: 'bg-jade-500 text-white hover:bg-jade-600 focus-visible:ring-jade-400',
};

export function Button({
  variant = 'primary', loading = false, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
        transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4
        disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Field wrappers ---------- */
const fieldBase =
  'w-full rounded-xl border border-mist-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-600/40 ' +
  'transition-shadow focus:outline-none focus:ring-4 focus:ring-cobalt-300/30 focus:border-cobalt-400 ' +
  'dark:border-ink-600 dark:bg-ink-800 dark:text-mist-100 dark:placeholder:text-mist-300/30';

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-700/70 dark:text-mist-300/70">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-600/60 dark:text-mist-300/50">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-coral-500">{error}</span>}
    </label>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldBase} ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldBase} ${className}`} {...rest}>{children}</select>;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldBase} min-h-[90px] ${className}`} {...rest} />;
}

/* ---------- Card ---------- */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`glass p-5 ${className}`}>{children}</div>;
}

/* ---------- Badge ---------- */
const badgeTones: Record<string, string> = {
  pending: 'bg-saffron-400/15 text-saffron-600 dark:text-saffron-400',
  pending_hr: 'bg-cobalt-400/15 text-cobalt-600 dark:text-cobalt-300',
  changes_requested: 'bg-saffron-400/25 text-saffron-600 dark:text-saffron-400',
  approved: 'bg-jade-400/15 text-jade-600 dark:text-jade-400',
  rejected: 'bg-coral-400/15 text-coral-600 dark:text-coral-400',
  cancelled: 'bg-mist-300/40 text-ink-700/70 dark:bg-ink-600/50 dark:text-mist-300',
  active: 'bg-jade-400/15 text-jade-600 dark:text-jade-400',
  inactive: 'bg-mist-300/40 text-ink-700/70 dark:bg-ink-600/50 dark:text-mist-300',
  info: 'bg-cobalt-400/15 text-cobalt-600 dark:text-cobalt-300',
};
export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${badgeTones[tone] || badgeTones.info}`}>
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, wide = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={`glass max-h-[92vh] w-full overflow-y-auto rounded-b-none rounded-t-3xl p-6 animate-rise sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-700/60 hover:bg-mist-200 dark:text-mist-300 dark:hover:bg-ink-700">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-mist-200 dark:bg-ink-700 ${className}`} />;
}

/* ---------- Empty state ---------- */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Inbox className="text-mist-300 dark:text-ink-600" size={36} />
      <p className="font-semibold text-ink-700/80 dark:text-mist-200">{title}</p>
      {hint && <p className="max-w-xs text-sm text-ink-600/60 dark:text-mist-300/60">{hint}</p>}
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, pageSize, total, onPage }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-ink-600/70 dark:text-mist-300/60">
        Page {page} of {pages} · {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" className="!px-3 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" className="!px-3 !py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
