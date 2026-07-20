// Minimal fetch wrapper: attaches the JWT, parses errors into friendly messages
// and signs the user out automatically when the session expires.

const TOKEN_KEY = 'hrms.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    tokenStore.clear();
    window.dispatchEvent(new Event('hrms:unauthorized'));
  }
  // 402 = license gate. Broadcast so the app can show a full-screen lock.
  if (res.status === 402) {
    try {
      const data = await res.clone().json();
      window.dispatchEvent(new CustomEvent('hrms:locked', { detail: data }));
    } catch { window.dispatchEvent(new CustomEvent('hrms:locked', { detail: {} })); }
  }
  if (!res.ok) {
    let message = 'Something went wrong. Try again.';
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch { /* non-JSON error body */ }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export function authedFileUrl(path: string): string {
  // For <img> tags we cannot set headers, so downloads go through fetch → blob.
  return path;
}

export async function fetchBlobUrl(path: string): Promise<string> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError('Could not load file.', res.status);
  return URL.createObjectURL(await res.blob());
}

export async function downloadFile(path: string, filename: string) {
  const url = await fetchBlobUrl(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
