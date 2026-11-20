// Tes LANGSUNG (opt-in) F4: profil, ganti password, logout semua perangkat, Tugas Saya berkelompok, pencarian cepat.
// Memakai pengguna sekali pakai (tidak menyentuh akun demo).
//
//   LIVE_API_URL=http://localhost:6990/api/v1 npx vitest run src/api/live.f4.test.ts
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { api } from './axios';
import { login, register } from './auth.api';
import { changePassword, listMyTasksGrouped, logoutAll, searchMyTasks, updateMe } from './me.api';
import { createProject, deleteProject } from './projects.api';
import { createTask, updateTask } from './tasks.api';

const LIVE = process.env['LIVE_API_URL'];
api.defaults.baseURL = LIVE ?? api.defaults.baseURL;

const status = (e: unknown) => (e as { response?: { status?: number } }).response?.status;
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe.skipIf(!LIVE)('F4 terhadap backend', () => {
  const stamp = Date.now();
  const email = `f4_${stamp}@example.com`;
  const pw = 'Passw0rdLive1';
  const key = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  let projectId = '';
  const ids: Record<string, string> = {};

  it('siapkan akun + proyek + tugas yang tersebar di semua kelompok deadline', async () => {
    await register({ name: 'F4 User', email, password: pw, confirm_password: pw });
    const me = useAuthStore.getState().user?.id ?? '';
    projectId = (await createProject({ name: 'Proyek F4', key })).id;
    const mk = async (name: string, title: string, due?: string) => (ids[name] = (await createTask(projectId, { title, assignee_id: me, ...(due ? { due_date: due } : {}) })).id);
    await mk('overdue', 'Tugas terlambat', day(-3));
    await mk('today', 'Tugas hari ini', day(0));
    await mk('later', 'Tugas bulan depan', day(40));
    await mk('none', 'Tugas tanpa tenggat');
    // minggu ini: besok, kecuali bila besok sudah lewat Minggu (maka "later"), sehingga kelompok diperiksa dari respons server
    await mk('tomorrow', 'Tugas besok', day(1));
  });

  it('Tugas Saya berkelompok: semua kelompok ada sebagai array (tidak null) dan tugas masuk kelompok yang benar', async () => {
    const g = await listMyTasksGrouped({});
    for (const k of ['overdue', 'today', 'this_week', 'later', 'no_deadline'] as const) expect(Array.isArray(g[k]), k).toBe(true);
    expect(g.overdue.map((t) => t.id)).toEqual([ids['overdue']]);
    expect(g.today.map((t) => t.id)).toEqual([ids['today']]);
    expect(g.later.map((t) => t.id)).toContain(ids['later']);
    expect(g.no_deadline.map((t) => t.id)).toEqual([ids['none']]);
    const all = [...g.overdue, ...g.today, ...g.this_week, ...g.later, ...g.no_deadline].map((t) => t.id);
    expect(new Set(all).size).toBe(all.length); // kelompok saling lepas
    expect(all).toContain(ids['tomorrow']);
    expect(g.overdue[0]?.project?.name).toBe('Proyek F4');
  });

  it('centang selesai: tugas hilang dari daftar, muncul lagi dengan include_done; filter q dan prioritas bekerja', async () => {
    await updateTask(ids['today'] as string, { status: 'done' });
    expect((await listMyTasksGrouped({})).today).toEqual([]);
    expect((await listMyTasksGrouped({ include_done: true })).today.map((t) => t.status)).toEqual(['done']);
    await updateTask(ids['today'] as string, { status: 'todo' }); // dibuka kembali
    expect((await listMyTasksGrouped({})).today).toHaveLength(1);
    expect((await listMyTasksGrouped({ q: 'terlambat' })).overdue).toHaveLength(1);
    expect((await listMyTasksGrouped({ q: 'terlambat' })).later).toEqual([]);
    await updateTask(ids['overdue'] as string, { priority: 'urgent' });
    expect((await listMyTasksGrouped({ priority: 'urgent' })).overdue).toHaveLength(1);
    expect((await listMyTasksGrouped({ priority: 'low' })).overdue).toEqual([]);
  });

  it('pencarian cepat: judul dan kode, termasuk yang selesai; karakter khusus % dan _ dianggap literal', async () => {
    expect((await searchMyTasks('tanpa tenggat')).map((t) => t.id)).toEqual([ids['none']]);
    expect((await searchMyTasks(`${key}-1`)).length).toBeGreaterThan(0); // kode tugas
    expect(await searchMyTasks('%%')).toEqual([]); // bukan wildcard
  });

  it('ubah profil memperbarui nama dan warna avatar (dan memori klien); validasi server menolak nama 1 huruf', async () => {
    const u = await updateMe({ name: 'F4 Baru', avatar_color: '#E64980' });
    expect(u).toMatchObject({ name: 'F4 Baru', avatar_color: '#E64980' });
    expect(useAuthStore.getState().user?.name).toBe('F4 Baru');
    const err = await updateMe({ name: 'x' }).catch((e: unknown) => e);
    expect(status(err)).toBe(400);
    expect(useAuthStore.getState().user?.name).toBe('F4 Baru'); // gagal tidak mengubah profil lokal
  });

  it('ganti password: sesi baru (token + kunci tanda tangan) langsung bisa dipakai; password lama/salah ditolak', async () => {
    const oldToken = useAuthStore.getState().accessToken;
    const err = await changePassword({ current_password: 'Salah12345', new_password: 'BaruPass123', confirm_password: 'BaruPass123' }).catch((e: unknown) => e);
    expect([400, 401]).toContain(status(err));
    expect(useAuthStore.getState().accessToken).toBe(oldToken); // gagal: sesi tidak berubah
    await changePassword({ current_password: pw, new_password: 'BaruPass123', confirm_password: 'BaruPass123' });
    expect(useAuthStore.getState().accessToken).not.toBe(oldToken);
    expect((await api.get('/me')).status).toBe(200); // sesi baru berfungsi
    expect((await listMyTasksGrouped({})).overdue).toHaveLength(1);
  });

  it('keluar dari semua perangkat: access token yang lama langsung tidak berlaku dan sesi lokal kosong', async () => {
    const before = useAuthStore.getState();
    await logoutAll();
    expect(useAuthStore.getState().status).toBe('guest');
    useAuthStore.setState({ status: 'authenticated', user: before.user, accessToken: before.accessToken, signingKey: before.signingKey });
    const err = await api.get('/me').catch((e: unknown) => e);
    expect(status(err)).toBe(401); // token dicabut (token_version naik); refresh juga dicabut
    // bersih-bersih: masuk dengan password baru lalu hapus proyek uji
    await login(email, 'BaruPass123');
    await deleteProject(projectId, 'Proyek F4');
  });
});
