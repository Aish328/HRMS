import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Button, Field, Input } from '../components/ui';
import { useToast } from '../components/Toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const user = await login(email, password);
      toast('success', `Welcome back, ${user.name.split(' ')[0]}.`);
      navigate(user.role === 'admin' ? '/admin' : '/app', { replace: true });
    } catch (err: any) {
      toast('error', err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Ambient background: the "meridian" arc */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-[100%] bg-gradient-to-b from-cobalt-500/25 via-cobalt-400/10 to-transparent blur-2xl" />
        <div className="absolute bottom-0 left-1/2 h-64 w-[700px] -translate-x-1/2 rounded-[100%] bg-saffron-400/15 blur-3xl" />
      </div>

      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cobalt-500 shadow-glow">
            <svg viewBox="0 0 32 32" className="h-8 w-8">
              <path d="M8 22 A9 9 0 0 1 24 22" stroke="#F0A020" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle cx="16" cy="11" r="2.5" fill="white" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Meridian HRMS</h1>
          <p className="mt-1 text-sm text-ink-600/70 dark:text-mist-300/60">Your workday, from punch-in to punch-out.</p>
        </div>

        <form onSubmit={submit} className="glass space-y-4 p-6">
          <Field label="Work email" error={errors.email}>
            <Input type="email" autoComplete="email" placeholder="you@company.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input type="password" autoComplete="current-password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} className="w-full">Sign in</Button>
          <p className="text-center text-xs text-ink-600/60 dark:text-mist-300/50">
            Sign in with your company email and password.
          </p>
        </form>
      </div>
    </div>
  );
}
