import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import type { ApiErrorBody, ApiOk, Auth } from '@/types/api';
import { signRequest } from '@/utils/signature';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // kirim cookie refresh token
});

/** Endpoint publik: tidak memakai token dan tidak ditandatangani (belum ada kunci). */
const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
const isPublic = (url?: string): boolean => PUBLIC_PATHS.some((p) => url === p || url?.endsWith(p));

type Cfg = InternalAxiosRequestConfig & { _authRetry?: boolean; _sigRetry?: boolean };

// Request: token + tanda tangan HMAC atas method, path, query, dan body yang PERSIS dikirim.
api.interceptors.request.use((config) => {
  const { accessToken, signingKey, clockOffsetSeconds } = useAuthStore.getState();
  if (accessToken && !isPublic(config.url)) {
    config.headers.Authorization = `Bearer ${accessToken}`;
    if (config.data !== undefined && config.data !== null && typeof config.data !== 'string') {
      config.data = JSON.stringify(config.data); // serialisasi sekali agar hash sama dengan byte yang dikirim
      config.headers['Content-Type'] = 'application/json';
    }
    if (signingKey) {
      const h = signRequest({
        method: config.method ?? 'get',
        url: api.getUri(config),
        body: typeof config.data === 'string' ? config.data : '',
        key: signingKey,
        clockOffsetSeconds,
      });
      for (const [k, v] of Object.entries(h)) config.headers.set(k, v);
    }
  }
  return config;
});

/** Menyelaraskan jam dari header Date respons (jam perangkat sering melenceng). Jitter <= 2 dtk diabaikan. */
function syncClock(dateHeader: unknown): void {
  if (typeof dateHeader !== 'string') return;
  const server = Date.parse(dateHeader);
  if (Number.isNaN(server)) return;
  const offset = Math.round((server - Date.now()) / 1000);
  const store = useAuthStore.getState();
  if (Math.abs(offset) > 2 && offset !== store.clockOffsetSeconds) store.setClockOffset(offset);
  else if (Math.abs(offset) <= 2 && store.clockOffsetSeconds !== 0) store.setClockOffset(0);
}

let refreshPromise: Promise<void> | null = null;

/** Satu refresh untuk banyak request yang gagal bersamaan. */
export function refreshSession(): Promise<void> {
  refreshPromise ??= api
    .post<ApiOk<Auth>>('/auth/refresh')
    .then((r) => {
      useAuthStore.getState().setSession(r.data.data);
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => {
    syncClock(res.headers?.['date']);
    return res;
  },
  async (error: AxiosError<ApiErrorBody>) => {
    const res = error.response;
    if (res) syncClock(res.headers?.['date']);
    const cfg = error.config as Cfg | undefined;
    if (!cfg || res?.status !== 401 || isPublic(cfg.url)) throw error;

    const code = res.data?.error?.code;
    // Jam melenceng atau nonce bentrok: ulangi sekali dengan waktu/nonce baru.
    if ((code === 'SIGNATURE_EXPIRED' || code === 'SIGNATURE_REPLAY') && !cfg._sigRetry) {
      cfg._sigRetry = true;
      return api(cfg);
    }
    // Token habis / tidak valid / kunci usang: perbarui sesi sekali lalu ulangi.
    if (!cfg._authRetry && code !== 'SIGNATURE_REQUIRED') {
      cfg._authRetry = true;
      try {
        await refreshSession();
      } catch {
        useAuthStore.getState().clear(); // route guard akan mengarahkan ke /login
        throw error;
      }
      return api(cfg);
    }
    throw error;
  },
);