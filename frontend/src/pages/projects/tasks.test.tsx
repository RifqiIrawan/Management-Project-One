import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { Toaster } from 'react-hot-toast';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/axios';
import { routes } from '@/routes';
import { useAuthStore } from '@/store/authStore';
import type { Comment, Member, Project, Task } from '@/types/api';

const me = { id: 'u1', name: 'Budi Santoso', email: 'budi@x.co', avatar_color: '#6366F1', last_login_at: null, created_at: '2026-01-01T00:00:00Z' };
const ok = (data: unknown, meta?: unknown) => [200, { success: true, data, ...(meta ? { meta } : {}) }] as [number, unknown];

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', name: 'Aplikasi Kasir', key: 'KSR', description: null, color: '#6366F1', icon: null, owner_id: 'u1', archived_at: null,
  created_at: '2026-11-01T00:00:00Z', my_role: 'owner', is_favorite: false, member_count: 2, task_count: 3, done_count: 1, progress: 33, ...over,
});
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', code: 'KSR-1', number: 1, project_id: 'p1', title: 'Buat halaman login', description: null, status: 'todo', priority: 'medium', labels: [],
  position: 1000, assignee: null, created_by: { id: 'u1', name: 'Budi Santoso' }, start_date: null, due_date: null, comment_count: 0, completed_at: null,
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...over,
});
const members: Member[] = [
  { user_id: 'u1', name: 'Budi Santoso', email: 'budi@x.co', avatar_color: '#6366F1', role: 'owner', joined_at: '2026-11-01T00:00:00Z' },
  { user_id: 'u2', name: 'Siti Aminah', email: 'siti@x.co', avatar_color: '#EC4899', role: 'member', joined_at: '2026-11-01T00:00:00Z' },
];
const comment = (over: Partial<Comment> = {}): Comment => ({
  id: 'c1', task_id: 't1', body: 'Sudah dicek\nbaris dua', author: { id: 'u1', name: 'Budi Santoso', avatar_color: '#6366F1' }, edited_at: null,
  created_at: new Date().toISOString(), can_edit: true, can_delete: true, ...over,
});

const t1 = task();
const t2 = task({ id: 't2', code: 'KSR-2', title: 'Perbaiki struk', status: 'in_progress', priority: 'urgent', due_date: '2020-01-01', labels: ['bug'], comment_count: 2 });
const t3 = task({ id: 't3', code: 'KSR-3', title: 'Selesai sudah', status: 'done', due_date: '2020-01-01', assignee: { id: 'u2', name: 'Siti Aminah', avatar_color: '#EC4899' } });
const board = { todo: [t1], in_progress: [t2], in_review: [], done: [t3] };

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

function setup(p: Project = project()) {
  mock.onGet('/projects/p1').reply(...ok(p));
  mock.onGet('/projects/p1/members').reply(...ok(members));
  mock.onGet('/projects/p1/tasks').reply((cfg) => {
    const params = cfg.params as Record<string, string | number>;
    if (params['view'] === 'board') return ok(board);
    return ok([t1, t2, t3], { page: Number(params['page'] ?? 1), per_page: 20, total: 3, total_pages: 1 });
  });
  mock.onGet('/tasks/t1').reply(() => ok(t1));
  mock.onGet('/tasks/t1/comments').reply(() => ok([]));
  mock.onGet('/tasks/t1/activities').reply(() => ok([]));
}

beforeEach(() => {
  mock = new MockAdapter(api);
  useAuthStore.setState({ status: 'authenticated', user: me, accessToken: 'tok', signingKey: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA' });
});
afterEach(() => mock.restore());

const taskGets = () => mock.history.get.filter((c) => c.url === '/projects/p1/tasks');

describe('board', () => {
  it('/projects/:id diarahkan ke board; empat kolom dengan kartu dan jumlahnya', async () => {
    setup();
    renderAt('/projects/p1');
    const todo = await screen.findByRole('region', { name: 'Kolom To Do' });
    expect(router.state.location.pathname).toBe('/projects/p1/board');
    expect(within(todo).getByText('Buat halaman login')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Kolom In Progress' })).getByText('Perbaiki struk')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Kolom In Review' })).getByText('Kosong')).toBeInTheDocument();
    expect(within(todo).getByLabelText('1 tugas')).toBeInTheDocument();
  });

  it('kartu menampilkan deadline terlambat (tidak untuk yang selesai), label komentar, dan assignee', async () => {
    setup();
    renderAt('/projects/p1/board');
    const progress = await screen.findByRole('region', { name: 'Kolom In Progress' });
    expect(within(progress).getByText(/Terlambat:/)).toBeInTheDocument();
    expect(within(progress).getByText('2')).toBeInTheDocument();
    const done = screen.getByRole('region', { name: 'Kolom Done' });
    expect(within(done).queryByText(/Terlambat:/)).not.toBeInTheDocument(); // sudah selesai: bukan terlambat
    expect(within(done).getByRole('img', { name: 'Siti Aminah' })).toBeInTheDocument();
  });

  it('filter dikirim ke server dan tersimpan di URL; hapus filter mengembalikan semuanya', async () => {
    setup();
    renderAt('/projects/p1/board');
    await screen.findByRole('region', { name: 'Kolom To Do' });
    await userEvent.type(screen.getByLabelText('Cari tugas'), 'login');
    await waitFor(() => expect(taskGets().some((c) => c.params?.q === 'login' && c.params?.view === 'board')).toBe(true));
    expect(router.state.location.search).toContain('q=login');
    await userEvent.click(screen.getByRole('button', { name: 'Filter Prioritas' }));
    await userEvent.click(await screen.findByLabelText('Urgent'));
    await waitFor(() => expect(taskGets().some((c) => c.params?.priority === 'urgent' && c.params?.q === 'login')).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Hapus filter' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('membuka filter dari URL (bisa dibagikan) langsung memakai parameternya', async () => {
    setup();
    renderAt('/projects/p1/board?status=todo,done&assignee=me');
    await screen.findByRole('region', { name: 'Kolom To Do' });
    expect(taskGets()[0]?.params).toMatchObject({ status: 'todo,done', assignee: 'me', view: 'board' });
    expect(screen.getByRole('button', { name: 'Filter Status' })).toHaveTextContent('2');
  });

  it('tombol + pada kolom membuka form dengan status kolom itu; kirim -> POST dan panel tugas terbuka', async () => {
    setup();
    mock.onPost('/projects/p1/tasks').reply(201, { success: true, data: task({ id: 't9', code: 'KSR-9', title: 'Baru', status: 'in_review' }) });
    mock.onGet('/tasks/t9').reply(() => ok(task({ id: 't9', code: 'KSR-9', title: 'Baru', status: 'in_review' })));
    mock.onGet('/tasks/t9/comments').reply(() => ok([]));
    mock.onGet('/tasks/t9/activities').reply(() => ok([]));
    renderAt('/projects/p1/board');
    await userEvent.click(await screen.findByRole('button', { name: 'Tambah tugas di In Review' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Status')).toHaveValue('in_review');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Buat tugas' }));
    expect(await within(dialog).findByText('Judul wajib diisi')).toBeInTheDocument();
    expect(mock.history.post).toHaveLength(0);
    await userEvent.type(within(dialog).getByLabelText('Judul'), '  Baru  ');
    await userEvent.type(within(dialog).getByLabelText(/Label/), 'bug, Bug, ui');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Buat tugas' }));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(bodyOf(mock.history.post[0])).toEqual({ title: 'Baru', status: 'in_review', priority: 'medium', labels: ['bug', 'ui'] });
    await waitFor(() => expect(router.state.location.search).toContain('task=t9'));
  });

  it('deadline sebelum tanggal mulai ditolak di klien', async () => {
    setup();
    renderAt('/projects/p1/board');
    await userEvent.click(await screen.findByRole('button', { name: 'Tugas baru' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Judul'), 'X');
    await userEvent.type(within(dialog).getByLabelText('Mulai'), '2026-11-20');
    await userEvent.type(within(dialog).getByLabelText('Deadline'), '2026-11-10');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Buat tugas' }));
    expect(await within(dialog).findByText('Deadline tidak boleh sebelum tanggal mulai')).toBeInTheDocument();
    expect(mock.history.post).toHaveLength(0);
  });

  it('proyek terarsip: tanpa tombol tambah, ada catatan hanya-baca, kartu tidak bisa diseret', async () => {
    setup(project({ archived_at: '2026-11-10T00:00:00Z' }));
    renderAt('/projects/p1/board');
    await screen.findByRole('region', { name: 'Kolom To Do' });
    expect(screen.getByText(/Proyek diarsipkan/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tugas baru' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tambah tugas di/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem').filter((li) => li.getAttribute('aria-roledescription'))).toHaveLength(0);
  });

  it('gagal memuat: pesan error dan coba lagi', async () => {
    setup();
    let n = 0;
    mock.onGet('/projects/p1/tasks').reply(() => (++n === 1 ? [500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Server bermasalah' } }] : ok(board)));
    renderAt('/projects/p1/board');
    expect(await screen.findByText('Server bermasalah')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('region', { name: 'Kolom To Do' })).toBeInTheDocument();
  });
});

describe('tabel', () => {
  it('menampilkan baris dan mengirim sort lewat kepala kolom (menaik -> menurun -> default)', async () => {
    setup();
    renderAt('/projects/p1/list');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3
    await userEvent.click(within(table).getByRole('button', { name: 'Prioritas' }));
    await waitFor(() => expect(taskGets().some((c) => c.params?.sort === 'priority' && c.params?.view === 'list')).toBe(true));
    expect(await screen.findByRole('columnheader', { name: /Prioritas/ })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /Prioritas/ }));
    expect(await screen.findByRole('columnheader', { name: /Prioritas/ })).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /Prioritas/ }));
    await waitFor(() => expect(router.state.location.search).not.toContain('sort='));
  });

  it('pagination: halaman berikutnya meminta page=2, filter baru kembali ke halaman 1', async () => {
    setup();
    mock.onGet('/projects/p1/tasks').reply((cfg) => ok([t1], { page: Number((cfg.params as Record<string, number>)['page'] ?? 1), per_page: 20, total: 45, total_pages: 3 }));
    renderAt('/projects/p1/list');
    expect(await screen.findByText(/45 tugas · halaman 1 dari 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    await waitFor(() => expect(taskGets().some((c) => c.params?.page === 2)).toBe(true));
    expect(router.state.location.search).toContain('page=2');
    await userEvent.type(screen.getByLabelText('Cari tugas'), 'x');
    await waitFor(() => expect(router.state.location.search).not.toContain('page='));
  });

  it('hasil kosong karena filter: pesan khusus dengan tombol hapus filter', async () => {
    setup();
    mock.onGet('/projects/p1/tasks').reply(() => ok([], { page: 1, per_page: 20, total: 0, total_pages: 0 }));
    renderAt('/projects/p1/list?q=zzz');
    expect(await screen.findByText('Tidak ada tugas yang cocok')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Hapus filter' })).toHaveLength(2); // toolbar + empty state
    await userEvent.click(screen.getAllByRole('button', { name: 'Hapus filter' })[1] as HTMLElement);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});

describe('panel detail tugas', () => {
  it('klik judul membuka panel (URL ?task=) dan menutupnya menghapus parameter', async () => {
    setup();
    renderAt('/projects/p1/board');
    await userEvent.click(await screen.findByRole('button', { name: 'Buat halaman login' }));
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    expect(router.state.location.search).toContain('task=t1');
    expect(await within(panel).findByDisplayValue('Buat halaman login')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(router.state.location.search).not.toContain('task='));
  });

  it('tautan langsung ?task= membuka panel; tugas dari proyek lain/tidak ada tidak menampilkan data', async () => {
    setup();
    mock.onGet('/tasks/zz').reply(404, { success: false, error: { code: 'NOT_FOUND', message: 'Tugas tidak ditemukan' } });
    mock.onGet('/tasks/tx').reply(() => ok(task({ id: 'tx', project_id: 'other', title: 'Rahasia' })));
    renderAt('/projects/p1/board?task=zz');
    expect(await screen.findByText('Tugas tidak ditemukan atau sudah dihapus.')).toBeInTheDocument();
  });

  it('mengubah status/prioritas mengirim PATCH satu field; judul kosong dikembalikan tanpa request', async () => {
    setup();
    mock.onPatch('/tasks/t1').reply(() => ok(task({ status: 'in_review' })));
    renderAt('/projects/p1/board?task=t1');
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    await userEvent.selectOptions(await within(panel).findByLabelText('Status'), 'in_review');
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(bodyOf(mock.history.patch[0])).toEqual({ status: 'in_review' });
    const title = within(panel).getByLabelText('Judul');
    await userEvent.clear(title);
    await userEvent.tab();
    expect(title).toHaveValue('Buat halaman login');
    expect(mock.history.patch).toHaveLength(1);
  });

  it('mengosongkan penanggung jawab dan deskripsi mengirim null', async () => {
    setup();
    mock.onGet('/tasks/t1').reply(() => ok(task({ description: 'lama', assignee: { id: 'u2', name: 'Siti Aminah', avatar_color: '#EC4899' } })));
    mock.onPatch('/tasks/t1').reply(() => ok(task({ description: 'lama' })));
    renderAt('/projects/p1/board?task=t1');
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    await userEvent.selectOptions(await within(panel).findByLabelText('Penanggung jawab'), '');
    await waitFor(() => expect(bodyOf(mock.history.patch[0])).toEqual({ assignee_id: null }));
    const desc = within(panel).getByLabelText('Deskripsi');
    await userEvent.clear(desc);
    await userEvent.tab();
    await waitFor(() => expect(bodyOf(mock.history.patch[1])).toEqual({ description: null }));
  });

  it('label lebih dari 5 ditolak di klien tanpa request', async () => {
    setup();
    renderAt('/projects/p1/board?task=t1');
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    const labels = await within(panel).findByLabelText(/Label/);
    await userEvent.type(labels, 'a,b,c,d,e,f');
    await userEvent.tab();
    expect(await within(panel).findByText('Maksimal 5 label')).toBeInTheDocument();
    expect(mock.history.patch).toHaveLength(0);
  });

  it('hapus tugas: hanya pembuat atau owner; konfirmasi lalu DELETE dan panel tertutup', async () => {
    setup();
    mock.onDelete('/tasks/t1').reply(200, { success: true });
    renderAt('/projects/p1/board?task=t1');
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    await userEvent.click(await within(panel).findByRole('button', { name: /Hapus tugas/ }));
    const confirm = (await screen.findAllByRole('dialog')).at(-1) as HTMLElement;
    await userEvent.click(within(confirm).getByRole('button', { name: 'Hapus' }));
    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
    await waitFor(() => expect(router.state.location.search).not.toContain('task='));
  });

  it('member bukan pembuat tidak melihat tombol hapus; di proyek terarsip semua bidang nonaktif', async () => {
    setup(project({ my_role: 'member' }));
    mock.onGet('/tasks/t1').reply(() => ok(task({ created_by: { id: 'u2', name: 'Siti Aminah' } })));
    renderAt('/projects/p1/board?task=t1');
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    await within(panel).findByLabelText('Status');
    expect(within(panel).queryByRole('button', { name: /Hapus tugas/ })).not.toBeInTheDocument();
  });

  it('proyek terarsip: bidang nonaktif dan tanpa form komentar', async () => {
    setup(project({ archived_at: '2026-11-10T00:00:00Z' }));
    renderAt('/projects/p1/board?task=t1');
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    expect(await within(panel).findByLabelText('Status')).toBeDisabled();
    expect(within(panel).getByLabelText('Judul')).toBeDisabled();
    expect(within(panel).queryByRole('form', { name: 'Tulis komentar' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /Hapus tugas/ })).not.toBeInTheDocument();
  });
});

describe('komentar & riwayat', () => {
  it('menulis komentar: tombol nonaktif bila kosong, POST dengan isi dipangkas, daftar dimuat ulang', async () => {
    setup();
    mock.onPost('/tasks/t1/comments').reply(201, { success: true, data: comment() });
    renderAt('/projects/p1/board?task=t1');
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    const send = await within(panel).findByRole('button', { name: 'Kirim' });
    expect(send).toBeDisabled();
    await userEvent.type(within(panel).getByLabelText('Tulis komentar', { selector: 'textarea' }), '  Halo tim  ');
    expect(send).toBeEnabled();
    await userEvent.click(send);
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(bodyOf(mock.history.post[0])).toEqual({ body: 'Halo tim' });
    await waitFor(() => expect(mock.history.get.filter((c) => c.url === '/tasks/t1/comments').length).toBeGreaterThan(1));
  });

  it('komentar lebih dari 5000 karakter ditolak di klien', async () => {
    setup();
    renderAt('/projects/p1/board?task=t1');
    const panel = await screen.findByRole('dialog', { name: 'Detail tugas' });
    const box = await within(panel).findByLabelText('Tulis komentar', { selector: 'textarea' });
    await userEvent.click(box);
    await userEvent.paste('x'.repeat(5001));
    expect(await within(panel).findByText('Komentar maksimal 5000 karakter')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Kirim' })).toBeDisabled();
  });

  it('tombol Ubah/Hapus mengikuti can_edit/can_delete dari server; isi tampil sebagai teks (bukan HTML)', async () => {
    setup();
    mock.onGet('/tasks/t1/comments').reply(() =>
      ok([
        comment({ id: 'c1', body: '<img src=x onerror=alert(1)>', can_edit: true, can_delete: true }),
        comment({ id: 'c2', body: 'milik orang lain', author: { id: 'u2', name: 'Siti Aminah' }, can_edit: false, can_delete: true, edited_at: '2026-11-20T00:00:00Z' }),
        comment({ id: 'c3', body: 'tidak bisa diapa-apakan', author: { id: 'u3', name: 'Dewi' }, can_edit: false, can_delete: false }),
      ]),
    );
    renderAt('/projects/p1/board?task=t1');
    const list = await screen.findByRole('list', { name: 'Komentar' });
    expect(within(list).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(list.querySelector('img')).toBeNull();
    expect(within(list).getAllByRole('button', { name: 'Ubah' })).toHaveLength(1);
    expect(within(list).getAllByRole('button', { name: 'Hapus' })).toHaveLength(2);
    expect(within(list).getByText('(diedit)')).toBeInTheDocument();
  });

  it('ubah komentar: PATCH dengan isi baru; hapus komentar: DELETE', async () => {
    setup();
    mock.onGet('/tasks/t1/comments').reply(() => ok([comment()]));
    mock.onPatch('/comments/c1').reply(() => ok(comment({ body: 'baru' })));
    mock.onDelete('/comments/c1').reply(200, { success: true });
    renderAt('/projects/p1/board?task=t1');
    await userEvent.click(await screen.findByRole('button', { name: 'Ubah' }));
    const box = screen.getByLabelText('Ubah komentar');
    await userEvent.clear(box);
    await userEvent.type(box, 'baru');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(bodyOf(mock.history.patch[0])).toEqual({ body: 'baru' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Hapus' }));
    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
  });

  it('tab Riwayat menampilkan kalimat dari server', async () => {
    setup();
    mock.onGet('/tasks/t1/activities').reply(() => ok([{ id: 1, action: 'task.created', message: 'Budi membuat tugas KSR-1', user: { id: 'u1', name: 'Budi Santoso', avatar_color: '#6366F1' }, task_id: 't1', code: 'KSR-1', metadata: {}, created_at: new Date().toISOString() }]));
    renderAt('/projects/p1/board?task=t1');
    await userEvent.click(await screen.findByRole('button', { name: 'Riwayat' }));
    expect(await screen.findByText('Budi membuat tugas KSR-1')).toBeInTheDocument();
  });
});
