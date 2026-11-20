// Tes LANGSUNG (opt-in): menjalankan klien TypeScript yang sebenarnya (axios + penanda tangan) terhadap backend
// sungguhan yang berjalan dengan API_SIGNATURE=enforce. Bukti bahwa tanda tangan TypeScript diterima server.
//
//   (backend)  API_SIGNATURE=enforce API_RATE_LIMIT_PER_MIN=0 go run ./cmd/api
//   (frontend) LIVE_API_URL=http://localhost:6990/api/v1 npx vitest run src/api/live.test.ts
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { api } from './axios';
import { login, register } from './auth.api';

const LIVE = process.env['LIVE_API_URL'];
api.defaults.baseURL = LIVE ?? api.defaults.baseURL;

describe.skipIf(!LIVE)('klien TypeScript terhadap backend enforce', () => {
  const email = `live_${Date.now()}@example.com`;
  const err = (e: unknown) => (e as { response?: { status?: number; data?: { error?: { code?: string } } } }).response;

  it('register + login mengembalikan signing_key, lalu request bertanda tangan diterima', async () => {
    await register({ name: 'Live Test', email, password: 'Passw0rdLive1', confirm_password: 'Passw0rdLive1' });
    expect(useAuthStore.getState().signingKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const me = await api.get('/me');
    expect(me.status).toBe(200);
    expect(me.data.data.email).toBe(email);
  });

  it('POST dengan body unicode/emoji, GET dengan query khusus, dan DELETE dengan body diterima', async () => {
    const key = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    const p = await api.post('/projects', { name: 'Proyek 🚀 中文', key, description: 'Uji ✓' });
    expect(p.status).toBe(201);
    expect((await api.get('/projects', { params: { q: 'Proyek 🚀', archived: false } })).status).toBe(200);
    expect((await api.get(`/projects/${p.data.data.id}/tasks`, { params: { status: 'todo,in_progress', sort: '-created_at', per_page: 5 } })).status).toBe(200);
    expect((await api.delete(`/projects/${p.data.data.id}`, { data: { confirm_name: 'Proyek 🚀 中文' } })).status).toBe(200);
  });

  it('kunci yang salah ditolak server (SIGNATURE_INVALID), dan klien memulihkan diri lewat refresh', async () => {
    const good = useAuthStore.getState().signingKey;
    useAuthStore.setState({ signingKey: 'A'.repeat(43) });
    // kunci salah -> SIGNATURE_INVALID -> interceptor refresh (cookie) -> kunci benar -> sukses
    const r = await api.get('/me');
    expect(r.status).toBe(200);
    expect(useAuthStore.getState().signingKey).not.toBe('A'.repeat(43));
    expect(useAuthStore.getState().signingKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(good).toBeTruthy();
  });

  it('jam perangkat melenceng 10 menit: SIGNATURE_EXPIRED dipulihkan lewat sinkronisasi header Date', async () => {
    useAuthStore.setState({ clockOffsetSeconds: -600 }); // seolah jam klien maju 10 menit
    const r = await api.get('/me');
    expect(r.status).toBe(200);
    expect(Math.abs(useAuthStore.getState().clockOffsetSeconds)).toBeLessThanOrEqual(2);
  });

  it('tanpa kunci (tanda tangan hilang) server menjawab SIGNATURE_REQUIRED dan klien tidak berputar', async () => {
    const token = useAuthStore.getState().accessToken;
    useAuthStore.setState({ signingKey: null });
    try {
      await api.get('/me');
      expect.unreachable('harus ditolak');
    } catch (e) {
      expect(err(e)?.status).toBe(401);
      expect(err(e)?.data?.error?.code).toBe('SIGNATURE_REQUIRED');
    }
    expect(useAuthStore.getState().accessToken).toBe(token);
  });

  it('login dengan password salah: 401 tanpa memicu refresh', async () => {
    try {
      await login(email, 'SalahBanget1');
      expect.unreachable('harus ditolak');
    } catch (e) {
      expect(err(e)?.status).toBe(401);
    }
  });
});