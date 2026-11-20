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
import { suggestKey, createProjectSchema } from '@/schemas/project.schema';
import { useAuthStore } from '@/store/authStore';
import type { Member, Project } from '@/types/api';

const me = { id: 'u1', name: 'Budi Santoso', email: 'budi@x.co', avatar_color: '#6366F1', last_login_at: null, created_at: '2026-01-01T00:00:00Z' };
const ok = (data: unknown) => [200, { success: true, data }] as [number, unknown];

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'Aplikasi Kasir',
  key: 'KSR',
  description: 'Kasir toko',
  color: '#6366F1',
  icon: '🧾',
  owner_id: 'u1',
  archived_at: null,
  created_at: '2026-11-01T00:00:00Z',
  my_role: 'owner',
  is_favorite: false,
  member_count: 2,
  task_count: 4,
  done_count: 1,
  progress: 25,
  members_preview: [{ id: 'u1', name: 'Budi Santoso', avatar_color: '#6366F1' }],
  ...over,
});
const member = (over: Partial<Member> = {}): Member => ({ user_id: 'u1', name: 'Budi Santoso', email: 'budi@x.co', avatar_color: '#6366F1', role: 'owner', joined_at: '2026-11-01T00:00:00Z', ...over });
const siti = member({ user_id: 'u2', name: 'Siti Aminah', email: 'siti@x.co', role: 'member' });

let mock: MockAdapter;

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return router;
}

beforeAll(preloadRoutes, 30000);

beforeEach(() => {
  mock = new MockAdapter(api);
  useAuthStore.setState({ status: 'authenticated', user: me, accessToken: 'tok', signingKey: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA' });
});
afterEach(() => mock.reset()); // adapter tetap terpasang: request terlambat dijawab mock, bukan jaringan

const bodyOf = (call: { data?: string }) => JSON.parse(call.data ?? '{}') as Record<string, unknown>;

describe('schema & util', () => {
  it('suggestKey: inisial kata, atau 3 huruf pertama, maks 5', () => {
    expect(suggestKey('Aplikasi Kasir Toko')).toBe('AKT');
    expect(suggestKey('Marketing')).toBe('MAR');
    expect(suggestKey('A B C D E F G')).toBe('ABCDE');
    expect(suggestKey('123 !!')).toBe('');
  });
  it('kode proyek: diubah ke huruf besar, tolak angka/terlalu pendek/terlalu panjang', () => {
    const base = { name: 'Proyek', description: '', color: '#6366F1', icon: '' };
    expect(createProjectSchema.parse({ ...base, key: ' mpo ' }).key).toBe('MPO');
    expect(createProjectSchema.safeParse({ ...base, key: 'A' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...base, key: 'ABCDEF' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...base, key: 'AB1' }).success).toBe(false);
  });
});

describe('dashboard', () => {
  const dash = (over: object = {}) =>
    ok({
      user: { id: 'u1', name: 'Budi Santoso' },
      today: '2026-11-20',
      week_end: '2026-11-22',
      stats: { total_tasks: 9, open_tasks: 6, completed_tasks: 3, in_progress: 2, due_this_week: 4, overdue: 1 },
      upcoming_tasks: [
        {
          id: 't1',
          code: 'KSR-3',
          number: 3,
          project_id: 'p1',
          project: { id: 'p1', name: 'Aplikasi Kasir', key: 'KSR', color: '#6366F1' },
          title: 'Perbaiki struk',
          description: null,
          status: 'in_progress',
          priority: 'high',
          labels: [],
          position: 1,
          assignee: null,
          created_by: { id: 'u1', name: 'Budi Santoso' },
          start_date: null,
          due_date: '2026-11-19',
          comment_count: 0,
          completed_at: null,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
          is_overdue: true,
        },
      ],
      recent_projects: [project()],
      recent_activities: [{ id: 1, action: 'task.created', message: 'Budi membuat KSR-3', user: { id: 'u1', name: 'Budi Santoso', avatar_color: '#6366F1' }, task_id: 't1', code: 'KSR-3', metadata: {}, created_at: new Date().toISOString() }],
      ...over,
    });

  const myTask = (id: string, title: string, status: string, priority: string, due: string | null) =>
    ({ id, code: `KSR-${id}`, number: 1, project_id: 'p1', project: { id: 'p1', name: 'Aplikasi Kasir', key: 'KSR', color: '#3B5BDB' }, title, description: null, status, priority, labels: [], position: 1, assignee: null, created_by: { id: 'u1', name: 'Budi Santoso' }, start_date: null, due_date: due, comment_count: 0, completed_at: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' });
  const mineRows = [myTask('1', 'Desain checkout', 'in_progress', 'high', '2020-01-01'), myTask('2', 'Tulis dokumentasi', 'todo', 'low', null), myTask('3', 'Perbaiki filter', 'done', 'medium', '2026-11-18')];

  it('menampilkan statistik, tenggat terdekat (terlambat ditandai), progres proyek, dan aktivitas', async () => {
    mock.onGet('/dashboard').reply(...dash());
    mock.onGet('/me/tasks').reply(...ok(mineRows));
    mock.onGet('/projects').reply(...ok([project()]));
    renderAt('/');
    const stats = await screen.findByRole('group', { name: 'Statistik tugas saya' });
    expect(within(within(stats).getByText('Tugas aktif').parentElement as HTMLElement).getByText('6')).toBeInTheDocument();
    expect(within(stats).getByText('2 dikerjakan')).toBeInTheDocument();
    expect(within(stats).getByText('33% dari total')).toBeInTheDocument();
    expect(within(within(stats).getByText('Terlambat').parentElement as HTMLElement).getByText('1')).toBeInTheDocument();
    const due = screen.getByRole('list', { name: 'Tenggat terdekat' });
    expect(within(due).getByRole('link', { name: 'Perbaiki struk' })).toHaveAttribute('href', '/projects/p1/board?task=t1');
    expect(within(due).getByText('Terlambat')).toBeInTheDocument(); // teks pembaca layar untuk tanggal lewat
    const progress = screen.getByRole('list', { name: 'Daftar progres proyek' });
    expect(within(progress).getByRole('link', { name: 'Aplikasi Kasir' })).toHaveAttribute('href', '/projects/p1');
    expect(within(progress).getByRole('progressbar', { name: 'Progress Aplikasi Kasir' })).toHaveAttribute('aria-valuenow', '25');
    expect(within(screen.getByRole('list', { name: 'Aktivitas terbaru' })).getByText('Budi membuat KSR-3')).toBeInTheDocument();
  });

  it('Tugas Saya: tab Semua/Aktif/Selesai menyaring baris; baris menaut ke papan proyek dengan panel terbuka', async () => {
    mock.onGet('/dashboard').reply(...dash());
    mock.onGet('/me/tasks').reply(...ok(mineRows));
    mock.onGet('/projects').reply(...ok([]));
    renderAt('/');
    const panel = await screen.findByRole('region', { name: 'Tugas saya' });
    expect(await within(panel).findByText('Desain checkout')).toBeInTheDocument();
    expect(within(panel).getAllByRole('row')).toHaveLength(4); // header + 3
    expect(mock.history.get.find((c) => c.url === '/me/tasks')?.params).toMatchObject({ include_done: true });
    await userEvent.click(within(panel).getByRole('button', { name: 'Aktif' }));
    expect(within(panel).queryByText('Perbaiki filter')).not.toBeInTheDocument();
    expect(within(panel).getAllByRole('row')).toHaveLength(3);
    await userEvent.click(within(panel).getByRole('button', { name: 'Selesai' }));
    expect(within(panel).getByText('Perbaiki filter')).toBeInTheDocument();
    expect(within(panel).queryByText('Desain checkout')).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /Perbaiki filter/ })).toHaveAttribute('href', '/projects/p1/board?task=3');
  });

  it('sidebar menampilkan jumlah tugas aktif dan daftar proyek sebagai tautan', async () => {
    mock.onGet('/dashboard').reply(...dash());
    mock.onGet('/me/tasks').reply(...ok([]));
    mock.onGet('/projects').reply(...ok([project(), project({ id: 'p2', name: 'Backend Core', key: 'BEC', color: '#0E9384' })]));
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    expect(await within(nav).findByRole('link', { name: 'Aplikasi Kasir' })).toHaveAttribute('href', '/projects/p1');
    expect(within(nav).getByRole('link', { name: 'Backend Core' })).toHaveAttribute('href', '/projects/p2');
    expect(within(nav).getByRole('link', { name: /Tugas Saya/ })).toHaveTextContent('6');
  });

  it('akun baru: semua daftar kosong menampilkan empty state, bukan halaman rusak', async () => {
    mock.onGet('/dashboard').reply(...dash({ upcoming_tasks: [], recent_projects: [], recent_activities: [] }));
    mock.onGet('/me/tasks').reply(...ok([]));
    mock.onGet('/projects').reply(...ok([]));
    renderAt('/');
    expect(await screen.findByText('Tidak ada tugas mendesak')).toBeInTheDocument();
    expect(screen.getByText('Belum ada aktivitas')).toBeInTheDocument();
    expect(screen.getByText('Belum ada proyek')).toBeInTheDocument();
    expect(await screen.findByText('Tidak ada tugas')).toBeInTheDocument();
  });

  it('gagal memuat: pesan error dengan tombol coba lagi yang memuat ulang', async () => {
    let calls = 0;
    mock.onGet('/dashboard').reply(() => {
      calls++;
      return calls === 1 ? [500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } }] : dash();
    });
    renderAt('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Terjadi kesalahan server');
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('group', { name: 'Statistik tugas saya' })).toBeInTheDocument();
  });
});

describe('daftar proyek', () => {
  it('menampilkan kartu proyek dengan progress dan menandai terarsip', async () => {
    mock.onGet('/projects').reply(...ok([project(), project({ id: 'p2', name: 'Lama', key: 'LMA', archived_at: '2026-11-10T00:00:00Z', progress: 100 })]));
    renderAt('/projects');
    const list = await screen.findByRole('list', { name: 'Daftar proyek' });
    expect(within(list).getAllByRole('progressbar')).toHaveLength(2);
    expect(within(list).getByRole('progressbar', { name: 'Progress Aplikasi Kasir' })).toHaveAttribute('aria-valuenow', '25');
    expect(within(list).getByText('Diarsipkan')).toBeInTheDocument();
  });

  it('pencarian dikirim sebagai q (setelah jeda) dan tombol Arsip meminta archived=true', async () => {
    mock.onGet('/projects').reply(...ok([project()]));
    renderAt('/projects');
    await screen.findByRole('list', { name: 'Daftar proyek' });
    await userEvent.type(screen.getByLabelText('Cari proyek'), 'kasir');
    await waitFor(() => expect(mock.history.get.some((c) => c.params?.q === 'kasir')).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Arsip' }));
    await waitFor(() => expect(mock.history.get.some((c) => c.params?.archived === true)).toBe(true));
  });

  it('kosong: ajakan membuat proyek; hasil pencarian kosong: pesan berbeda', async () => {
    mock.onGet('/projects').reply(...ok([]));
    renderAt('/projects');
    expect(await screen.findByText('Belum ada proyek')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Cari proyek'), 'zzz');
    expect(await screen.findByText('Tidak ada proyek yang cocok')).toBeInTheDocument();
  });

  it('bintang favorit memanggil POST /favorite lalu memuat ulang daftar', async () => {
    mock.onGet('/projects').reply(...ok([project()]));
    mock.onPost('/projects/p1/favorite').reply(...ok({ is_favorite: true }));
    renderAt('/projects');
    await userEvent.click(await screen.findByRole('button', { name: 'Jadikan Aplikasi Kasir favorit' }));
    await waitFor(() => expect(mock.history.post.map((c) => c.url)).toContain('/projects/p1/favorite'));
    await waitFor(() => expect(mock.history.get.filter((c) => c.url === '/projects').length).toBeGreaterThan(1));
  });
});

describe('buat proyek', () => {
  async function openModal() {
    mock.onGet('/projects').reply(...ok([]));
    const router = renderAt('/projects');
    await userEvent.click((await screen.findAllByRole('button', { name: /Proyek baru/ }))[0] as HTMLElement);
    await screen.findByRole('dialog');
    return router;
  }
  const submit = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat proyek' });

  it('input kosong: pesan validasi dan tidak ada request POST', async () => {
    await openModal();
    await userEvent.click(submit());
    expect(await screen.findByText('Nama minimal 2 karakter')).toBeInTheDocument();
    expect(screen.getByText('Kode 2-5 huruf (A-Z)')).toBeInTheDocument();
    expect(mock.history.post).toHaveLength(0);
  });

  it('kode disarankan dari nama, dikirim huruf besar, lalu pindah ke halaman proyek', async () => {
    const router = await openModal();
    mock.onPost('/projects').reply(201, { success: true, data: project({ id: 'pNew', name: 'Aplikasi Kasir' }) });
    mock.onGet('/projects/pNew').reply(...ok(project({ id: 'pNew' })));
    await userEvent.type(screen.getByLabelText('Nama proyek'), 'Aplikasi Kasir');
    expect(screen.getByLabelText(/Kode/)).toHaveValue('AK');
    await userEvent.clear(screen.getByLabelText(/Kode/));
    await userEvent.type(screen.getByLabelText(/Kode/), 'ksr');
    await userEvent.click(submit());
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/pNew'));
    expect(bodyOf(mock.history.post[0] as { data?: string })).toMatchObject({ name: 'Aplikasi Kasir', key: 'KSR', color: '#6366F1' });
  });

  it('kode sudah dipakai (409) ditampilkan pada kolom kode dan modal tetap terbuka', async () => {
    await openModal();
    mock.onPost('/projects').reply(409, { success: false, error: { code: 'CONFLICT', message: 'Kode proyek sudah dipakai' } });
    await userEvent.type(screen.getByLabelText('Nama proyek'), 'Aplikasi Kasir');
    await userEvent.click(submit());
    expect(await screen.findByText('Kode ini sudah dipakai proyek lain')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('halaman proyek & hak akses', () => {
  it('proyek tidak ada / bukan anggota (404): halaman tidak ditemukan', async () => {
    mock.onGet('/projects/x').reply(404, { success: false, error: { code: 'NOT_FOUND', message: 'Proyek tidak ditemukan' } });
    renderAt('/projects/x');
    expect(await screen.findByText('Halaman tidak ditemukan.')).toBeInTheDocument();
  });

  it('breadcrumb memakai nama proyek, bukan UUID', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    renderAt('/projects/p1/members');
    mock.onGet('/projects/p1/members').reply(...ok([member()]));
    const crumb = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    await waitFor(() => expect(within(crumb).getByRole('link', { name: 'Aplikasi Kasir' })).toBeInTheDocument());
    expect(within(crumb).queryByText('p1')).not.toBeInTheDocument();
  });

  it('member: pengaturan hanya-baca (tanpa formulir, arsip, hapus)', async () => {
    mock.onGet('/projects/p1').reply(...ok(project({ my_role: 'member' })));
    renderAt('/projects/p1/settings');
    expect(await screen.findByText('Hanya owner yang dapat mengubah pengaturan proyek.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Form pengaturan proyek' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hapus proyek' })).not.toBeInTheDocument();
  });

  it('owner: simpan hanya aktif setelah ada perubahan dan mengirim PATCH', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onPatch('/projects/p1').reply(...ok(project({ name: 'Kasir Baru' })));
    renderAt('/projects/p1/settings');
    const save = await screen.findByRole('button', { name: 'Simpan perubahan' });
    expect(save).toBeDisabled();
    const name = screen.getByLabelText('Nama proyek');
    await userEvent.clear(name);
    await userEvent.type(name, 'Kasir Baru');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(bodyOf(mock.history.patch[0] as { data?: string })).toMatchObject({ name: 'Kasir Baru' });
  });

  it('owner: arsipkan mengirim archived=true', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onPost('/projects/p1/archive').reply(...ok(project({ archived_at: '2026-11-20T00:00:00Z' })));
    renderAt('/projects/p1/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Arsipkan' }));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(bodyOf(mock.history.post[0] as { data?: string })).toEqual({ archived: true });
  });

  it('hapus proyek: tombol baru aktif setelah nama diketik persis, lalu DELETE dengan confirm_name', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onGet('/projects').reply(...ok([]));
    mock.onDelete('/projects/p1').reply(200, { success: true });
    const router = renderAt('/projects/p1/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Hapus proyek' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Hapus permanen' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Ketik/), 'aplikasi kasir');
    expect(confirm).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText(/Ketik/));
    await userEvent.type(within(dialog).getByLabelText(/Ketik/), 'Aplikasi Kasir');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'));
    expect(bodyOf(mock.history.delete[0] as { data?: string })).toEqual({ confirm_name: 'Aplikasi Kasir' });
  });
});

describe('anggota', () => {
  it('owner melihat formulir undang dan pemilih peran; member tidak', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onGet('/projects/p1/members').reply(...ok([member(), siti]));
    renderAt('/projects/p1/members');
    expect(await screen.findByRole('form', { name: 'Undang anggota' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Peran Siti Aminah')).toBeInTheDocument();
  });

  it('member: tanpa undang dan tanpa ubah peran; hanya tombol Keluar untuk dirinya', async () => {
    mock.onGet('/projects/p1').reply(...ok(project({ my_role: 'member' })));
    mock.onGet('/projects/p1/members').reply(...ok([member({ user_id: 'u9', name: 'Owner Lain', email: 'o@x.co' }), member({ role: 'member' })]));
    renderAt('/projects/p1/members');
    await screen.findByRole('list', { name: 'Daftar anggota' });
    expect(screen.queryByRole('form', { name: 'Undang anggota' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Keluar|Keluarkan/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument();
  });

  it('undang lewat email: POST dengan email dan daftar dimuat ulang', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onGet('/projects/p1/members').reply(...ok([member()]));
    mock.onPost('/projects/p1/members').reply(201, { success: true, data: siti });
    renderAt('/projects/p1/members');
    await userEvent.type(await screen.findByLabelText('Email pengguna terdaftar'), 'siti@x.co');
    await userEvent.click(screen.getByRole('button', { name: 'Undang' }));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(bodyOf(mock.history.post[0] as { data?: string })).toMatchObject({ email: 'siti@x.co', role: 'member' });
  });

  it('email tidak valid ditolak di klien; email belum terdaftar (404) dijelaskan', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onGet('/projects/p1/members').reply(...ok([member()]));
    mock.onPost('/projects/p1/members').reply(404, { success: false, error: { code: 'NOT_FOUND', message: 'User tidak ditemukan' } });
    renderAt('/projects/p1/members');
    const input = await screen.findByLabelText('Email pengguna terdaftar');
    await userEvent.type(input, 'bukan-email');
    await userEvent.click(screen.getByRole('button', { name: 'Undang' }));
    expect(await screen.findByText('Format email tidak valid')).toBeInTheDocument();
    expect(mock.history.post).toHaveLength(0);
    await userEvent.clear(input);
    await userEvent.type(input, 'tak@ada.co');
    await userEvent.click(screen.getByRole('button', { name: 'Undang' }));
    expect(await screen.findByText('Pengguna dengan email itu belum terdaftar')).toBeInTheDocument();
  });

  it('saran pencarian pengguna muncul (min. 3 karakter) dan tidak menampilkan yang sudah anggota', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onGet('/projects/p1/members').reply(...ok([member(), siti]));
    mock.onGet('/users/search').reply(...ok([{ id: 'u2', name: 'Siti Aminah', email: 'siti@x.co', avatar_color: '#111111' }, { id: 'u3', name: 'Sinta', email: 'sinta@x.co', avatar_color: '#222222' }]));
    renderAt('/projects/p1/members');
    await userEvent.type(await screen.findByLabelText('Email pengguna terdaftar'), 'si');
    expect(mock.history.get.some((c) => c.url === '/users/search')).toBe(false);
    await userEvent.type(screen.getByLabelText('Email pengguna terdaftar'), 'n');
    const sugg = await screen.findByRole('list', { name: 'Saran pengguna' });
    expect(within(sugg).getByText('Sinta')).toBeInTheDocument();
    expect(within(sugg).queryByText('Siti Aminah')).not.toBeInTheDocument();
  });

  it('ubah peran mengirim PATCH; owner terakhir (400) menampilkan pesan server', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onGet('/projects/p1/members').reply(...ok([member(), siti]));
    mock.onPatch('/projects/p1/members/u2').reply(...ok({ ...siti, role: 'owner' }));
    mock.onPatch('/projects/p1/members/u1').reply(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Proyek harus punya minimal satu owner' } });
    renderAt('/projects/p1/members');
    await userEvent.selectOptions(await screen.findByLabelText('Peran Siti Aminah'), 'owner');
    await waitFor(() => expect(bodyOf(mock.history.patch[0] as { data?: string })).toEqual({ role: 'owner' }));
    await userEvent.selectOptions(screen.getByLabelText('Peran Budi Santoso'), 'member');
    expect(await screen.findByText('Proyek harus punya minimal satu owner')).toBeInTheDocument();
  });

  it('keluarkan anggota meminta konfirmasi lalu DELETE', async () => {
    mock.onGet('/projects/p1').reply(...ok(project()));
    mock.onGet('/projects/p1/members').reply(...ok([member(), siti]));
    mock.onDelete('/projects/p1/members/u2').reply(200, { success: true });
    renderAt('/projects/p1/members');
    await userEvent.click(await screen.findByRole('button', { name: 'Keluarkan' }));
    expect(mock.history.delete).toHaveLength(0);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keluarkan' }));
    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
  });

  it('keluar sendiri: DELETE dirinya lalu kembali ke daftar proyek', async () => {
    mock.onGet('/projects/p1').reply(...ok(project({ my_role: 'member' })));
    mock.onGet('/projects/p1/members').reply(...ok([member({ user_id: 'u9', name: 'Owner Lain', email: 'o@x.co' }), member({ role: 'member' })]));
    mock.onGet('/projects').reply(...ok([]));
    mock.onDelete('/projects/p1/members/u1').reply(200, { success: true });
    const router = renderAt('/projects/p1/members');
    await userEvent.click(await screen.findByRole('button', { name: 'Keluar' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keluar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'));
  });
});
