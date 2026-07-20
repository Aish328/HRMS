import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

/*
 * LicenseLock — full-screen overlay shown when the server reports the
 * deployment's license is invalid/expired (HTTP 402). It mounts once at the app
 * root, listens for the 'hrms:locked' event emitted by the API client, and also
 * polls /api/license/status on load so a lock is shown even before the user
 * makes their first API call.
 *
 * This is a disclosed licensing screen — it tells the operator exactly what's
 * wrong and who to contact to renew.
 */

type LockInfo = {
  message?: string;
  detail?: string;
  contact?: string;
  licensee?: string;
  expired_on?: string;
  reason?: string;
};

export default function LicenseLock() {
  const [lock, setLock] = useState<LockInfo | null>(null);

  useEffect(() => {
    const onLock = (e: Event) => setLock((e as CustomEvent).detail || {});
    window.addEventListener('hrms:locked', onLock);

    // Proactive check on load (covers the case where the very first request
    // hasn't happened yet).
    fetch('/api/license/status')
      .then((r) => r.json())
      .then((s) => { if (!s.ok) setLock({
        message: 'This HRMS deployment is not currently licensed.',
        detail: s.reason === 'expired' ? `License expired on ${s.expires}.` : undefined,
        contact: s.contact, licensee: s.licensee, expired_on: s.expires, reason: s.reason,
      }); })
      .catch(() => { /* server unreachable — let normal error handling deal with it */ });

    return () => window.removeEventListener('hrms:locked', onLock);
  }, []);

  if (!lock) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/80 p-6 backdrop-blur-md">
      <div className="glass w-full max-w-md p-8 text-center animate-rise">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-coral-400/15">
          <ShieldAlert className="text-coral-500" size={32} />
        </div>
        <h1 className="font-display text-xl font-extrabold">Deployment locked</h1>
        <p className="mt-2 text-sm text-ink-700/80 dark:text-mist-200/80">
          {lock.message || 'This HRMS deployment’s license is not valid.'}
        </p>
        {lock.detail && (
          <p className="mt-1 text-xs text-ink-600/60 dark:text-mist-300/50">{lock.detail}</p>
        )}
        <div className="mt-5 rounded-xl bg-mist-100 p-4 text-left text-sm dark:bg-ink-800/60">
          {lock.licensee && (
            <p className="text-ink-700/80 dark:text-mist-200/80"><span className="font-semibold">Licensed to:</span> {lock.licensee}</p>
          )}
          {lock.expired_on && (
            <p className="text-ink-700/80 dark:text-mist-200/80"><span className="font-semibold">Expired:</span> {new Date(lock.expired_on).toLocaleDateString()}</p>
          )}
          <p className="mt-1 text-ink-700/80 dark:text-mist-200/80">
            <span className="font-semibold">To restore access, contact:</span> {lock.contact || 'the system provider'}
          </p>
        </div>
        <p className="mt-4 text-xs text-ink-600/50 dark:text-mist-300/40">
          Existing data is safe and unmodified. Access resumes as soon as a valid license is applied.
        </p>
      </div>
    </div>
  );
}
