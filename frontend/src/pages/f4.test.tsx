import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { Toaster } from 'react-hot-toast';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/axios';
import { preloadRoutes } from '@/test/preloadRoutes';
import { routes } from '@/routes';
import { useAuthStore } from '@/store/authStore';
import type { Auth, Project, Task } from '@/types/api';

const me = { id: 'u1', name: 'Budi Santoso', email: 'budi@x.co', avatar_color: '#6366F1', last_login_at: null, created_at: '2026-01-15T00:00:00Z' };
const ok = (data: unknown) => [200, { success: true, data }] as [number, unknown];
const KEY = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA';

const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id, code: `KSR-${id}`, number: 1, project_id: 'p1', project: { id: 'p1', name: 'Aplikasi Kasir', key: 'KSR', color: '#3B5BDB' }, title, description: null,
  status: 'todo', priority: 'medium', labels: [], position: 1, assignee: null, created_by: { id: 'u1', name: 'Budi Santoso' }, start_date: null, due_date: null,
  comment_count: 0, completed_at: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...over,
});
const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', name: 'Aplikasi Kasir', key: 'KSR', description: null, color: '#6366F1', icon: null, owner_id: 'u1', archived_at: null, created_at: '2026-11-01T00:00:00Z',
  my_role: 'owner', is_favorite: false, member_count: 1, task_count: 3, done_count: 1, progress: 33, ...over,
});
const grouped = (over: object = {}) => ({ overdue: [], today: [], this_week: [], later: [], no_deadline: [], ...over });

let mock: MockAdapter;
let router: ReturnType<typeof createMemoryRouter>;

function renderAt(path: string) {
  router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
}
const bodyOf = (call: { data?: string } | undefined) => JSON.parse(call?.data ?? '{}') as Record<string, unknown>;
const mineGets = () => mock.history.get.filter((c) => c.url === '/me/tasks');
/** Dashboard memanggil /me/tasks sebagai array; halaman Tugas Saya dengan group=due sebagai objek. */
const meTasksMock = (flat: Task[] = [], grp: object = grouped()) => mock.onGet('/me/tasks').reply((cfg) => ((cfg.params as Record<string, unknown>)?.['group'] ? ok(grp) : ok(flat)));

beforeAll(preloadRoutes, 30000);

beforeEach(() => {
  mock = new MockAdapter(api);
  useAuthStore.setState({ status: 'authenticated', user: me, accessToken: 'tok', signingKey: KEY });
  mock.onGet('/dashboard').reply(() => ok({ user: { id: 'u1', name: 'Budi' }, today: '2026-11-20', week_end: '2026-11-22', stats: { total_tasks: 4, open_tasks: 3, completed_tasks: 1, in_progress: 1, due_this_week: 1, overdue: 1 }, upcoming_tasks: [], recent_projects: [], recent_activities: [] }));
  mock.onGet('/projects').reply(() => ok([project(), project({ id: 'p2', name: 'Backend Core', key: 'BEC', color: '#0E9384' })]));
});
afterEach(() => mock.reset());

describe('Tugas Saya', () => {
  const data = () =>
    grouped({
      overdue: [task('1', 'Perbaiki struk', { priority: 'urgent', due_date: '2026-11-18' })],
      today: [task('2', 'Review API', { priority: 'high', due_date: '2026-11-20' })],
      later: [task('3', 'Tulis dokumentasi', { priority: 'low', due_date: '2026-12-01' })],
    });

  it('menampilkan hanya kelompok yang berisi, dengan jumlah, tautan ke papan proyek, dan ringkasan', async () => {
    meTasksMock([], data());
    renderAt('/my-tasks');
    const overdue = await screen.findByRole('region', { name: 'Terlambat' });
    expect(within(overdue).getByRole('link', { name: 'Perbaiki struk' })).toHaveAttribute('href', '/projects/p1/board?task=1');
    expect(within(overdue).getByText('Aplikasi Kasir')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Hari ini' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Nanti' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Minggu ini' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Tanpa deadline' })).not.toBeInTheDocument();
    const summary = screen.getByRole('group', { name: 'Ringkasan tugas saya' });
    expect(within(summary).getByText('1 terlambat')).toBeInTheDocument();
    expect(within(summary).getByText('3 total')).toBeInTheDocument();
    expect(mineGets()[0]?.params).toEqual({ group: 'due' });
  });

  it('filter dikirim ke server: cari (setelah jeda), prioritas, dan tampilkan yang selesai', async () => {
    meTasksMock([], data());
    renderAt('/my-tasks');
    await screen.findByRole('region', { name: 'Terlambat' });
    await userEvent.type(screen.getByLabelText('Cari tugas saya'), 'struk');
    await waitFor(() => expect(mineGets().some((c) => c.params?.q === 'struk')).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Prioritas'), 'high');
    await waitFor(() => expect(mineGets().some((c) => c.params?.priority === 'high' && c.params?.q === 'struk')).toBe(true));
    await userEvent.click(screen.getByRole('switch', { name: 'Tampilkan yang selesai' }));
    await waitFor(() => expect(mineGets().some((c) => c.params?.include_done === true)).toBe(true));
  });

  it('centang menandai selesai (PATCH status=done) dan memuat ulang daftar serta jumlah di sidebar', async () => {
    meTasksMock([], data());
    mock.onPatch('/tasks/1').reply(() => ok(task('1', 'Perbaiki struk', { status: 'done' })));
    renderAt('/my-tasks');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Tandai selesai: Perbaiki struk' }));
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(bodyOf(mock.history.patch[0])).toEqual({ status: 'done' });
    expect(await screen.findByText('KSR-1 selesai')).toBeInTheDocument();
    await waitFor(() => expect(mineGets().length).toBeGreaterThan(1));
    await waitFor(() => expect(mock.history.get.filter((c) => c.url === '/dashboard').length).toBeGreaterThan(1)); // sidebar
  });

  it('tugas selesai tampil tercentang dan dicoret; membatalkan centang membuka kembali (status=todo)', async () => {
    meTasksMock([], grouped({ today: [task('9', 'Sudah beres', { status: 'done', due_date: '2026-11-20' })] }));
    mock.onPatch('/tasks/9').reply(() => ok(task('9', 'Sudah beres')));
    renderAt('/my-tasks');
    const box = await screen.findByRole('checkbox', { name: 'Batalkan selesai: Sudah beres' });
    expect(box).toBeChecked();
    await userEvent.click(box);
    await waitFor(() => expect(bodyOf(mock.history.patch[0])).toEqual({ status: 'todo' }));
  });

  it('kosong: ajakan ke proyek; kosong karena filter: pesan berbeda', async () => {
    meTasksMock();
    renderAt('/my-tasks');
    expect(await screen.findByText('Tidak ada tugas untuk Anda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat proyek' })).toHaveAttribute('href', '/projects');
    await userEvent.selectOptions(screen.getByLabelText('Prioritas'), 'low');
    expect(await screen.findByText('Tidak ada tugas yang cocok')).toBeInTheDocument();
  });

  it('memuat: skeleton (bukan layar kosong); gagal: pesan dengan coba lagi', async () => {
    let n = 0;
    mock.onGet('/me/tasks').reply(() => new Promise((res) => setTimeout(() => res(++n === 1 ? [500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Server bermasalah' } }] : ok(data())), 60)));
    renderAt('/my-tasks');
    expect(await screen.findByText('Memuat tugas saya...')).toBeInTheDocument();
    expect(await screen.findByText('Server bermasalah')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('region', { name: 'Terlambat' })).toBeInTheDocument();
  });
});

describe('Profil', () => {
  it('menampilkan data akun; simpan baru aktif setelah ada perubahan; PATCH /me dan profil di sidebar ikut berubah', async () => {
    mock.onPatch('/me').reply((cfg) => ok({ ...me, ...JSON.parse(cfg.data as string) }));
    renderAt('/profile');
    const form = await screen.findByRole('form', { name: 'Form profil' });
    expect(within(form).getByLabelText('Email')).toBeDisabled();
    expect(within(form).getByLabelText('Email')).toHaveValue('budi@x.co');
    const save = within(form).getByRole('button', { name: 'Simpan profil' });
    expect(save).toBeDisabled();
    const name = within(form).getByLabelText('Nama');
    await userEvent.clear(name);
    await userEvent.type(name, 'Budi Baru');
    expect(save).toBeEnabled();
    await userEvent.click(within(form).getByRole('button', { name: 'Warna #E64980' }));
    await userEvent.click(save);
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(bodyOf(mock.history.patch[0])).toEqual({ name: 'Budi Baru', avatar_color: '#E64980' });
    await waitFor(() => expect(useAuthStore.getState().user?.name).toBe('Budi Baru'));
    expect(await screen.findByText('Profil diperbarui')).toBeInTheDocument();
    expect((await screen.findAllByRole('link', { name: 'Profil Budi Baru' }))[0]).toHaveAttribute('href', '/profile'); // kartu pengguna di sidebar (desktop + menu seluler)
    expect(save).toBeDisabled(); // kembali bersih
  });

  it('nama terlalu pendek ditolak di klien tanpa request', async () => {
    renderAt('/profile');
    const form = await screen.findByRole('form', { name: 'Form profil' });
    const name = within(form).getByLabelText('Nama');
    await userEvent.clear(name);
    await userEvent.type(name, 'B');
    await userEvent.click(within(form).getByRole('button', { name: 'Simpan profil' }));
    expect(await within(form).findByText('Nama minimal 2 karakter')).toBeInTheDocument();
    expect(mock.history.patch).toHaveLength(0);
  });

  it('ganti password: validasi di klien (tidak sama, tanpa angka), lalu sukses mengganti sesi dan mengosongkan form', async () => {
    const next: Auth = { access_token: 'tok-baru', signing_key: 'B'.repeat(43), token_type: 'Bearer', expires_in: 900, user: me };
    mock.onPatch('/me/password').reply(() => ok(next));
    renderAt('/profile');
    const form = await screen.findByRole('form', { name: 'Form ganti password' });
    await userEvent.type(within(form).getByLabelText('Password saat ini'), 'LamaPass1');
    await userEvent.type(within(form).getByLabelText('Password baru'), 'hanyahuruf');
    await userEvent.type(within(form).getByLabelText('Konfirmasi password baru'), 'beda');
    await userEvent.click(within(form).getByRole('button', { name: 'Ganti password' }));
    expect(await within(form).findByText('Password harus mengandung huruf dan angka')).toBeInTheDocument();
    expect(within(form).getByText('Konfirmasi password tidak sama')).toBeInTheDocument();
    expect(mock.history.patch).toHaveLength(0);

    const pw = within(form).getByLabelText('Password baru');
    await userEvent.clear(pw);
    await userEvent.type(pw, 'BaruPass123');
    const conf = within(form).getByLabelText('Konfirmasi password baru');
    await userEvent.clear(conf);
    await userEvent.type(conf, 'BaruPass123');
    expect(within(form).getByText(/Kekuatan:/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Ganti password' }));
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(bodyOf(mock.history.patch[0])).toEqual({ current_password: 'LamaPass1', new_password: 'BaruPass123', confirm_password: 'BaruPass123' });
    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('tok-baru'));
    expect(useAuthStore.getState().signingKey).toBe('B'.repeat(43));
    expect(within(form).getByLabelText('Password saat ini')).toHaveValue('');
  });

  it('password saat ini salah (400 dari server) ditampilkan pada kolomnya', async () => {
    mock.onPatch('/me/password').reply(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', details: { current_password: 'Password saat ini salah' } } });
    renderAt('/profile');
    const form = await screen.findByRole('form', { name: 'Form ganti password' });
    await userEvent.type(within(form).getByLabelText('Password saat ini'), 'Salah123');
    await userEvent.type(within(form).getByLabelText('Password baru'), 'BaruPass123');
    await userEvent.type(within(form).getByLabelText('Konfirmasi password baru'), 'BaruPass123');
    await userEvent.click(within(form).getByRole('button', { name: 'Ganti password' }));
    expect(await within(form).findByText('Password saat ini salah')).toBeInTheDocument();
  });

  it('keluar dari semua perangkat: perlu konfirmasi, lalu POST logout-all, sesi kosong, kembali ke login', async () => {
    mock.onPost('/auth/logout-all').reply(200, { success: true });
    renderAt('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Keluar dari semua perangkat' }));
    expect(mock.history.post).toHaveLength(0);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keluar semua' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(useAuthStore.getState().status).toBe('guest');
    expect(mock.history.post.map((c) => c.url)).toContain('/auth/logout-all');
  });
});

describe('pencarian cepat (Ctrl+K)', () => {
  async function openPalette() {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await userEvent.keyboard('{Control>}k{/Control}');
    return screen.findByRole('dialog', { name: 'Pencarian cepat' });
  }

  it('Ctrl+K membuka dialog dengan fokus di kolom cari; menampilkan halaman dan proyek', async () => {
    const dlg = await openPalette();
    const input = within(dlg).getByRole('combobox');
    expect(input).toHaveFocus();
    const opts = within(dlg).getAllByRole('option').map((o) => o.textContent);
    expect(opts).toEqual(expect.arrayContaining(['Dashboard', 'Tugas Saya', 'Proyek', 'Profil']));
    expect(within(dlg).getByRole('option', { name: /Aplikasi Kasir/ })).toBeInTheDocument();
    expect(within(dlg).getByRole('option', { selected: true })).toHaveTextContent('Dashboard');
  });

  it('tombol Cari di topbar juga membuka; Esc menutup', async () => {
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Cari (Ctrl+K)' }));
    expect(await screen.findByRole('dialog', { name: 'Pencarian cepat' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pencarian cepat' })).not.toBeInTheDocument());
  });

  it('mengetik menyaring halaman dan proyek (nama atau kode); tanpa kecocokan menampilkan pesan', async () => {
    const dlg = await openPalette();
    await userEvent.type(within(dlg).getByRole('combobox'), 'bec');
    expect(await within(dlg).findByRole('option', { name: /Backend Core/ })).toBeInTheDocument(); // dicocokkan lewat kode BEC
    expect(within(dlg).queryByRole('option', { name: /Aplikasi Kasir/ })).not.toBeInTheDocument();
    await userEvent.clear(within(dlg).getByRole('combobox'));
    await userEvent.type(within(dlg).getByRole('combobox'), 'zzzqq');
    expect(await within(dlg).findByText('Tidak ada hasil untuk "zzzqq"')).toBeInTheDocument();
  });

  it('panah + Enter membuka pilihan (halaman); Enter pada proyek membuka proyek', async () => {
    const dlg = await openPalette();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(dlg).getByRole('option', { selected: true })).toHaveTextContent('Tugas Saya');
    meTasksMock();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/my-tasks'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pencarian cepat' })).not.toBeInTheDocument());
  });

  it('mencari tugas saya di server (min. 2 huruf, setelah jeda) dan Enter membuka tugasnya di papan proyek', async () => {
    mock.onGet('/me/tasks').reply(() => ok([task('7', 'Desain login', { code: 'KSR-7' })]));
    mock.onGet('/projects/p1').reply(() => ok(project()));
    const dlg = await openPalette();
    await userEvent.type(within(dlg).getByRole('combobox'), 'd');
    expect(mineGets().filter((c) => c.params?.q)).toHaveLength(0); // 1 huruf belum mencari (panel dashboard memanggil tanpa q)
    await userEvent.type(within(dlg).getByRole('combobox'), 'es');
    const opt = await within(dlg).findByRole('option', { name: /Desain login/ });
    expect(mineGets().find((c) => c.params?.q)?.params).toMatchObject({ q: 'des', include_done: true });
    expect(opt).toHaveTextContent('KSR-7 · Aplikasi Kasir');
    await userEvent.click(opt);
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p1/board'));
    expect(router.state.location.search).toBe('?task=7');
  });
});

describe('pintasan keyboard', () => {
  async function ready() {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
  }

  it('"?" menampilkan daftar pintasan', async () => {
    await ready();
    await userEvent.keyboard('?');
    const dlg = await screen.findByRole('dialog', { name: 'Pintasan keyboard' });
    expect(within(dlg).getByText('Ke Proyek')).toBeInTheDocument();
  });

  it('"g" lalu huruf berpindah halaman (p=Proyek, t=Tugas Saya, u=Profil, d=Dashboard)', async () => {
    meTasksMock();
    await ready();
    await userEvent.keyboard('gp');
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'));
    await userEvent.keyboard('gt');
    await waitFor(() => expect(router.state.location.pathname).toBe('/my-tasks'));
    await userEvent.keyboard('gu');
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'));
    await userEvent.keyboard('gd');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('"/" membuka pencarian cepat', async () => {
    await ready();
    await userEvent.keyboard('/');
    expect(await screen.findByRole('dialog', { name: 'Pencarian cepat' })).toBeInTheDocument();
  });

  it('diabaikan saat mengetik di kolom isian, tetapi Ctrl+K tetap bekerja di sana', async () => {
    renderAt('/projects');
    const box = await screen.findByLabelText('Cari proyek');
    await userEvent.click(box);
    await userEvent.keyboard('gp?/');
    expect(box).toHaveValue('gp?/'); // huruf masuk ke kolom, tidak memicu apa pun
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects');
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Pencarian cepat' })).toBeInTheDocument();
  });

  it('diabaikan saat dialog terbuka (tidak berpindah halaman di belakangnya)', async () => {
    await ready();
    await userEvent.keyboard('?');
    await screen.findByRole('dialog', { name: 'Pintasan keyboard' });
    await userEvent.keyboard('gp');
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('skeleton dan route malas', () => {
  it('dashboard menampilkan skeleton saat memuat, lalu isinya', async () => {
    mock.onGet('/dashboard').reply(() => new Promise((res) => setTimeout(() => res(ok({ user: { id: 'u1', name: 'B' }, today: '2026-11-20', week_end: '2026-11-22', stats: { total_tasks: 0, open_tasks: 0, completed_tasks: 0, in_progress: 0, due_this_week: 0, overdue: 0 }, upcoming_tasks: [], recent_projects: [], recent_activities: [] })), 60)));
    renderAt('/');
    expect(await screen.findByText('Memuat dashboard...')).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Statistik tugas saya' })).toBeInTheDocument();
    expect(screen.queryByText('Memuat dashboard...')).not.toBeInTheDocument();
  });

  it('halaman Proyek menampilkan skeleton kartu saat memuat', async () => {
    mock.onGet('/projects').reply(() => new Promise((res) => setTimeout(() => res(ok([project()])), 60)));
    renderAt('/projects');
    expect(await screen.findByText('Memuat proyek...')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Daftar proyek' })).toBeInTheDocument();
  });
});
