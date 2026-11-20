// Tes LANGSUNG (opt-in) F2: lapisan API proyek/anggota/dashboard terhadap backend sungguhan (API_SIGNATURE=enforce).
//
//   (backend)  API_SIGNATURE=enforce API_RATE_LIMIT_PER_MIN=0 go run ./cmd/api
//   (frontend) LIVE_API_URL=http://localhost:6990/api/v1 npx vitest run src/api/live.f2.test.ts
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { api } from './axios';
import { register } from './auth.api';
import { getDashboard } from './dashboard.api';
import {
  addMember,
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listMembers,
  listProjects,
  removeMember,
  searchUsers,
  toggleFavorite,
  updateMemberRole,
  updateProject,
} from './projects.api';

const LIVE = process.env['LIVE_API_URL'];
api.defaults.baseURL = LIVE ?? api.defaults.baseURL;

// Login dibatasi 5/menit/IP: sesi disimpan lalu dipulihkan, bukan login ulang.
type Session = ReturnType<typeof useAuthStore.getState>;
let ownerSession: Session;
let guestSession: Session;
const as = (s: Session) => useAuthStore.setState(s, true);

const status = (e: unknown) => (e as { response?: { status?: number } }).response?.status;

describe.skipIf(!LIVE)('lapisan API F2 terhadap backend enforce', () => {
  const stamp = Date.now();
  const ownerEmail = `f2_owner_${stamp}@example.com`;
  const guestEmail = `f2_guest_${stamp}@example.com`;
  const pw = 'Passw0rdLive1';
  const key = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  let projectId = '';
  let guestId = '';

  it('siapkan dua akun; dashboard akun baru: statistik nol dan semua daftar [] (bukan null)', async () => {
    await register({ name: 'F2 Guest', email: guestEmail, password: pw, confirm_password: pw });
    guestSession = useAuthStore.getState();
    guestId = guestSession.user?.id ?? '';
    await register({ name: 'F2 Owner', email: ownerEmail, password: pw, confirm_password: pw });
    ownerSession = useAuthStore.getState();
    const d = await getDashboard();
    expect(d.stats).toEqual({ total_tasks: 0, open_tasks: 0, completed_tasks: 0, in_progress: 0, due_this_week: 0, overdue: 0 });
    expect(d.upcoming_tasks).toEqual([]);
    expect(d.recent_projects).toEqual([]);
    expect(d.recent_activities).toEqual([]);
  });

  it('buat proyek (kode huruf kecil -> besar), muncul di daftar dan di dashboard', async () => {
    const p = await createProject({ name: 'Proyek F2 🚀', key: key.toLowerCase(), description: 'uji', color: '#10B981', icon: '🚀' });
    projectId = p.id;
    expect(p.key).toBe(key);
    expect(p.my_role).toBe('owner');
    expect((await listProjects('F2')).some((x) => x.id === projectId)).toBe(true);
    expect((await getDashboard()).recent_projects.some((x) => x.id === projectId)).toBe(true);
  });

  it('kode duplikat ditolak 409 dan nama terlalu pendek 400 dengan details per field', async () => {
    await expect(createProject({ name: 'Lain', key })).rejects.toSatisfy((e) => status(e) === 409);
    const err = await createProject({ name: 'x', key: 'ZZ' }).catch((e: unknown) => e);
    expect(status(err)).toBe(400);
    expect((err as { response: { data: { error: { details: Record<string, string> } } } }).response.data.error.details).toHaveProperty('name');
  });

  it('favorit toggle dan edit proyek (deskripsi dikosongkan)', async () => {
    expect((await toggleFavorite(projectId)).is_favorite).toBe(true);
    expect((await getProject(projectId)).is_favorite).toBe(true);
    const p = await updateProject(projectId, { name: 'Proyek F2 Baru', description: '' });
    expect(p.name).toBe('Proyek F2 Baru');
    expect(p.description).toBeNull();
  });

  it('undang anggota: pencarian email, undang, ubah peran, daftar anggota; email tak terdaftar 404; dobel 409', async () => {
    expect((await searchUsers(guestEmail.slice(0, 12))).some((u) => u.email === guestEmail)).toBe(true);
    const m = await addMember(projectId, guestEmail);
    expect(m.user_id).toBe(guestId);
    expect(m.role).toBe('member');
    await expect(addMember(projectId, guestEmail)).rejects.toSatisfy((e) => status(e) === 409);
    await expect(addMember(projectId, `tak_ada_${stamp}@example.com`)).rejects.toSatisfy((e) => status(e) === 404);
    expect((await updateMemberRole(projectId, guestId, 'owner')).role).toBe('owner');
    await updateMemberRole(projectId, guestId, 'member');
    expect((await listMembers(projectId)).map((x) => x.email)).toEqual(expect.arrayContaining([ownerEmail, guestEmail]));
  });

  it('member: aksi owner ditolak 403; owner terakhir tidak bisa keluar (400); member bisa keluar sendiri lalu 404', async () => {
    const ownerId = useAuthStore.getState().user?.id ?? '';
    as(guestSession);
    await expect(updateProject(projectId, { name: 'Peretas' })).rejects.toSatisfy((e) => status(e) === 403);
    await expect(archiveProject(projectId, true)).rejects.toSatisfy((e) => status(e) === 403);
    as(ownerSession);
    await expect(removeMember(projectId, ownerId)).rejects.toSatisfy((e) => status(e) === 400);
    as(guestSession);
    await removeMember(projectId, guestId);
    await expect(getProject(projectId)).rejects.toSatisfy((e) => status(e) === 404);
  });

  it('arsip menyembunyikan dari daftar default, lalu hapus butuh nama persis', async () => {
    as(ownerSession);
    expect((await archiveProject(projectId, true)).archived_at).not.toBeNull();
    expect((await listProjects('', false)).some((x) => x.id === projectId)).toBe(false);
    expect((await listProjects('', true)).some((x) => x.id === projectId)).toBe(true);
    await expect(deleteProject(projectId, 'nama salah')).rejects.toSatisfy((e) => status(e) === 400);
    await deleteProject(projectId, 'Proyek F2 Baru');
    await expect(getProject(projectId)).rejects.toSatisfy((e) => status(e) === 404);
  });
});
