import { recordSample, normalizePath } from "@/lib/perf";

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('denti_api_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '/api';
}

export function setApiBaseUrl(url: string) {
  if (typeof window === 'undefined') return;
  if (!url || !url.trim()) {
    localStorage.removeItem('denti_api_url');
  } else {
    let formatted = url.trim();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = `http://${formatted}`;
    }
    if (!formatted.endsWith('/api')) {
      formatted = `${formatted.replace(/\/+$/, '')}/api`;
    }
    localStorage.setItem('denti_api_url', formatted);
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('denti_token');
}

export function saveToken(token: string) {
  localStorage.setItem('denti_token', token);
}

export function removeToken() {
  localStorage.removeItem('denti_token');
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const base = getApiBaseUrl();
  const targetUrl = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(targetUrl, {
      ...options,
      headers: { ...headers, ...((options?.headers ?? {}) as Record<string, string>) },
    });
  } catch (err) {
    recordApiTiming(path, options?.method, started, 0);
    throw err;
  }
  recordApiTiming(path, options?.method, started, res.status);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

// Admin metrics polling is excluded so the dashboard doesn't measure itself
function recordApiTiming(path: string, method: string | undefined, started: number, status: number) {
  if (path.startsWith('/admin/metrics')) return;
  recordSample({
    kind: 'api',
    page: `${method ?? 'GET'} ${normalizePath(path)}`,
    ms: performance.now() - started,
    status,
  });
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
