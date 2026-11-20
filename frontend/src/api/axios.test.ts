import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import type { Auth } from '@/types/api';
import { bodyHash, canonicalQuery, canonicalString, decodeKey, sign } from '@/utils/signature';
import { api } from './axios';

const KEY1 = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA';
const KEY2 = 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8';
const user = { id: 'u1', name: 'Budi', email: 'b@x.co', avatar_color: '#6366F1', last_login_at: null, created_at: '2026-01-01T00:00:00Z' };
const auth = (token: string, key: string): Auth => ({ access_token: token, signing_key: key, token_type: 'Bearer', expires_in: 900, user });

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(api);
  useAuthStore.setState({ status: 'authenticated', user, accessToken: 'tok1', signingKey: KEY1, clockOffsetSeconds: 0 });
});
afterEach(() => mock.reset()); // adapter tetap terpasang: request terlambat dijawab mock, bukan jaringan

const unauthorized = (code: string) => [401, { success: false, error: { code, message: code } }] as [number, unknown];

/** Memverifikasi tanda tangan request dari sudut pandang server. */
function verify(config: { method?: string; headers?: Record<string, unknown>; data?: unknown }, key: string): boolean {
  const h = config.headers as Record<string, string>;
  const url = new URL(api.getUri(config as never));
  const canonical = canonicalString({
    method: config.method ?? 'get', path: url.pathname, query: canonicalQuery(url.search),
    body: typeof config.data === 'string' ? config.data : '', timestamp: h['X-Timestamp'] ?? '', nonce: h['X-Nonce'] ?? '',
  });
  return sign(decodeKey(key), canonical) === h['X-Signature'];
}

describe('penandatanganan request', () => {
  it('request terautentikasi membawa Bearer + header tanda tangan yang valid (GET dengan query)', async () => {
    let seen: Record<string, string> = {};
    mock.onGet('/projects').reply((cfg) => {
      seen = cfg.headers as unknown as Record<string, string>;
      expect(verify(cfg, KEY1)).toBe(true);
      return [200, { success: true, data: [] }];
    });
    await api.get('/projects', { params: { q: 'halo dunia', archived: false } });
    expect(seen['Authorization']).toBe('Bearer tok1');
    expect(seen['X-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(seen['X-Nonce']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('body JSON diserialisasi sekali dan hash-nya sama dengan byte yang dikirim', async () => {
    mock.onPost('/projects').reply((cfg) => {
      expect(typeof cfg.data).toBe('string');
      expect(JSON.parse(cfg.data as string)).toEqual({ name: 'Proyek 🚀', key: 'ABC' });
      expect(bodyHash(cfg.data as string)).toMatch(/^[0-9a-f]{64}$/);
      expect(verify(cfg, KEY1)).toBe(true);
      return [201, { success: true, data: {} }];
    });
    await api.post('/projects', { name: 'Proyek 🚀', key: 'ABC' });
  });

  it('endpoint publik (login/register/refresh/logout) tidak memakai token dan tidak ditandatangani', async () => {
    for (const p of ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']) {
      mock.onPost(p).reply((cfg) => {
        const h = cfg.headers as unknown as Record<string, string | undefined>;
        expect(h['Authorization']).toBeUndefined();
        expect(h['X-Signature']).toBeUndefined();
        return [200, { success: true, data: auth('t', KEY1) }];
      });
      await api.post(p, { x: 1 });
    }
  });

  it('tiap request memakai nonce berbeda', async () => {
    const nonces = new Set<string>();
    mock.onGet('/me').reply((cfg) => {
      nonces.add((cfg.headers as unknown as Record<string, string>)['X-Nonce'] ?? '');
      return [200, { success: true, data: {} }];
    });
    await Promise.all([api.get('/me'), api.get('/me'), api.get('/me')]);
    expect(nonces.size).toBe(3);
  });

  it('tanpa sesi: tidak ada header otentikasi', async () => {
    useAuthStore.getState().clear();
    mock.onGet('/health').reply((cfg) => {
      expect((cfg.headers as unknown as Record<string, string | undefined>)['Authorization']).toBeUndefined();
      return [200, {}];
    });
    await api.get('/health');
  });
});

describe('refresh token otomatis', () => {
  it('TOKEN_EXPIRED: refresh sekali, ulangi dengan token DAN kunci baru', async () => {
    let calls = 0;
    mock.onGet('/me').reply((cfg) => {
      calls++;
      const h = cfg.headers as unknown as Record<string, string>;
      if (h['Authorization'] === 'Bearer tok1') return unauthorized('TOKEN_EXPIRED');
      expect(h['Authorization']).toBe('Bearer tok2');
      expect(verify(cfg, KEY2)).toBe(true); // ditandatangani ulang dengan kunci baru
      return [200, { success: true, data: { ok: true } }];
    });
    mock.onPost('/auth/refresh').reply(200, { success: true, data: auth('tok2', KEY2) });
    const r = await api.get('/me');
    expect(r.data.data.ok).toBe(true);
    expect(calls).toBe(2);
    expect(useAuthStore.getState().accessToken).toBe('tok2');
    expect(useAuthStore.getState().signingKey).toBe(KEY2);
  });

  it('banyak request gagal bersamaan hanya memicu SATU refresh', async () => {
    mock.onGet(/\/(a|b|c)$/).reply((cfg) => {
      const h = cfg.headers as unknown as Record<string, string>;
      return h['Authorization'] === 'Bearer tok1' ? unauthorized('TOKEN_EXPIRED') : [200, { success: true, data: 1 }];
    });
    let refreshes = 0;
    mock.onPost('/auth/refresh').reply(async () => {
      refreshes++;
      await new Promise((r) => setTimeout(r, 20));
      return [200, { success: true, data: auth('tok2', KEY2) }];
    });
    const rs = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshes).toBe(1);
  });

  it('refresh gagal: sesi dibersihkan dan error asli diteruskan', async () => {
    mock.onGet('/me').reply(...unauthorized('TOKEN_EXPIRED'));
    mock.onPost('/auth/refresh').reply(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'x' } });
    await expect(api.get('/me')).rejects.toMatchObject({ response: { status: 401 } });
    expect(useAuthStore.getState().status).toBe('guest');
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().signingKey).toBeNull();
  });

  it('tidak berputar tanpa akhir: refresh sukses tetapi request tetap 401 -> berhenti setelah satu ulangan', async () => {
    let calls = 0;
    mock.onGet('/me').reply(() => {
      calls++;
      return unauthorized('UNAUTHORIZED');
    });
    mock.onPost('/auth/refresh').reply(200, { success: true, data: auth('tok2', KEY2) });
    await expect(api.get('/me')).rejects.toBeTruthy();
    expect(calls).toBe(2);
  });

  it('401 pada endpoint publik (login salah) TIDAK memicu refresh', async () => {
    let refreshes = 0;
    mock.onPost('/auth/login').reply(...unauthorized('UNAUTHORIZED'));
    mock.onPost('/auth/refresh').reply(() => {
      refreshes++;
      return [200, {}];
    });
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    expect(refreshes).toBe(0);
  });

  it('SIGNATURE_REQUIRED tidak memicu refresh (bukan masalah token)', async () => {
    let refreshes = 0;
    mock.onGet('/me').reply(...unauthorized('SIGNATURE_REQUIRED'));
    mock.onPost('/auth/refresh').reply(() => {
      refreshes++;
      return [200, {}];
    });
    await expect(api.get('/me')).rejects.toBeTruthy();
    expect(refreshes).toBe(0);
  });
});

describe('kesalahan tanda tangan', () => {
  it('SIGNATURE_EXPIRED / SIGNATURE_REPLAY: diulang SEKALI dengan nonce baru', async () => {
    for (const code of ['SIGNATURE_EXPIRED', 'SIGNATURE_REPLAY']) {
      mock.reset();
      const nonces: string[] = [];
      mock.onGet('/me').reply((cfg) => {
        nonces.push((cfg.headers as unknown as Record<string, string>)['X-Nonce'] ?? '');
        return nonces.length === 1 ? unauthorized(code) : [200, { success: true, data: 1 }];
      });
      const r = await api.get('/me');
      expect(r.status).toBe(200);
      expect(nonces).toHaveLength(2);
      expect(nonces[0]).not.toBe(nonces[1]);
    }
  });

  it('SIGNATURE_EXPIRED terus-menerus: berhenti setelah satu ulangan', async () => {
    let calls = 0;
    mock.onGet('/me').reply(() => {
      calls++;
      return unauthorized('SIGNATURE_EXPIRED');
    });
    mock.onPost('/auth/refresh').reply(200, { success: true, data: auth('tok2', KEY2) });
    await expect(api.get('/me')).rejects.toBeTruthy();
    expect(calls).toBeLessThanOrEqual(3); // 1 awal + 1 ulangan tanda tangan + 1 setelah refresh, tidak lebih
  });
});

describe('sinkronisasi jam dari header Date', () => {
  it('jam perangkat lambat 10 menit: offset dipelajari lalu timestamp dikoreksi', async () => {
    const serverNow = Date.now() + 600_000;
    mock.onGet('/health').reply(200, {}, { date: new Date(serverNow).toUTCString() });
    await api.get('/health');
    const off = useAuthStore.getState().clockOffsetSeconds;
    expect(off).toBeGreaterThan(595);
    expect(off).toBeLessThan(605);

    let ts = 0;
    mock.onGet('/me').reply((cfg) => {
      ts = Number((cfg.headers as unknown as Record<string, string>)['X-Timestamp']);
      return [200, {}];
    });
    await api.get('/me');
    expect(Math.abs(ts - serverNow / 1000)).toBeLessThan(6);
  });

  it('selisih kecil (<= 2 detik) diabaikan', async () => {
    mock.onGet('/health').reply(200, {}, { date: new Date(Date.now() + 1000).toUTCString() });
    await api.get('/health');
    expect(useAuthStore.getState().clockOffsetSeconds).toBe(0);
  });
});