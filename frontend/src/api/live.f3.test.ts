// Tes LANGSUNG (opt-in) F3: lapisan API tugas/komentar/riwayat dan logika drag & drop terhadap backend sungguhan.
//
//   (backend)  API_SIGNATURE=enforce API_RATE_LIMIT_PER_MIN=0 go run ./cmd/api
//   (frontend) LIVE_API_URL=http://localhost:6990/api/v1 npx vitest run src/api/live.f3.test.ts
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { columnsFromBoard, moveInColumns, planMove } from '@/utils/taskLogic';
import { api } from './axios';
import { register } from './auth.api';
import { addMember, archiveProject, createProject, deleteProject } from './projects.api';
import { createComment, createTask, deleteComment, deleteTask, getBoard, getTask, listComments, listTasks, moveTask, taskActivities, updateComment, updateTask } from './tasks.api';

const LIVE = process.env['LIVE_API_URL'];
api.defaults.baseURL = LIVE ?? api.defaults.baseURL;

type Session = ReturnType<typeof useAuthStore.getState>;
let ownerSession: Session;
let memberSession: Session;
const as = (s: Session) => useAuthStore.setState(s, true);
const status = (e: unknown) => (e as { response?: { status?: number } }).response?.status;

describe.skipIf(!LIVE)('lapisan API F3 terhadap backend enforce', () => {
  const stamp = Date.now();
  const pw = 'Passw0rdLive1';
  const memberEmail = `f3_member_${stamp}@example.com`;
  const key = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  let projectId = '';
  let memberId = '';
  const taskIds: string[] = [];
  const order = async (s: 'todo' | 'in_progress' | 'in_review' | 'done') => (await getBoard(projectId, {}))[s].map((t) => t.title);

  it('siapkan owner + member + proyek; buat 3 tugas (judul emoji), board urut paling baru di atas', async () => {
    await register({ name: 'F3 Member', email: memberEmail, password: pw, confirm_password: pw });
    memberSession = useAuthStore.getState();
    memberId = memberSession.user?.id ?? '';
    await register({ name: 'F3 Owner', email: `f3_owner_${stamp}@example.com`, password: pw, confirm_password: pw });
    ownerSession = useAuthStore.getState();
    projectId = (await createProject({ name: 'Proyek F3', key })).id;
    await addMember(projectId, memberEmail);
    for (const title of ['Satu 🚀', 'Dua', 'Tiga']) taskIds.push((await createTask(projectId, { title, labels: ['a', 'b'] })).id);
    expect(await order('todo')).toEqual(['Tiga', 'Dua', 'Satu 🚀']);
  });

  it('DRAG: rencana dari logika klien (atas, tengah, bawah, antar kolom, kolom kosong) menghasilkan urutan yang benar di server', async () => {
    const plan = async (active: string, over: string) => {
      const id = taskIds[['Satu 🚀', 'Dua', 'Tiga'].indexOf(active)] as string;
      const cols = columnsFromBoard(await getBoard(projectId, {}));
      const overId = over in cols ? over : (Object.values(cols).flat().find((t) => t.title === over)?.id as string);
      const p = planMove(moveInColumns(cols, id, overId), id);
      expect(p).not.toBeNull();
      await moveTask(id, p as { status: 'todo' });
    };
    // todo: [Tiga, Dua, Satu]; "Satu" ke atas "Tiga" -> paling atas
    await plan('Satu 🚀', 'Tiga');
    expect(await order('todo')).toEqual(['Satu 🚀', 'Tiga', 'Dua']);
    // "Satu" turun ke "Dua" -> paling bawah
    await plan('Satu 🚀', 'Dua');
    expect(await order('todo')).toEqual(['Tiga', 'Dua', 'Satu 🚀']);
    // "Satu" di antara Tiga dan Dua (posisi desimal)
    await plan('Satu 🚀', 'Dua');
    expect(await order('todo')).toEqual(['Tiga', 'Satu 🚀', 'Dua']);
    // antar kolom: ke kolom kosong lalu ke kolom berisi
    await plan('Dua', 'in_progress');
    await plan('Tiga', 'in_progress');
    expect(await order('in_progress')).toEqual(['Dua', 'Tiga']);
    expect(await order('todo')).toEqual(['Satu 🚀']);
    await plan('Satu 🚀', 'Tiga');
    expect(await order('in_progress')).toEqual(['Dua', 'Satu 🚀', 'Tiga']);
    // pemindahan ke done mengisi completed_at, keluar dari done mengosongkannya
    await moveTask(taskIds[1] as string, { status: 'done' });
    expect((await getTask(taskIds[1] as string)).completed_at).not.toBeNull();
    await moveTask(taskIds[1] as string, { status: 'todo' });
    expect((await getTask(taskIds[1] as string)).completed_at).toBeNull();
  });

  it('filter + sort + pagination: q, status, prioritas, assignee=me|none, sort, per_page', async () => {
    const [a, b, c] = taskIds as [string, string, string];
    await updateTask(a, { priority: 'urgent', due_date: '2020-01-01', assignee_id: ownerSession.user?.id ?? '' });
    await updateTask(b, { priority: 'low' });
    expect((await listTasks(projectId, { q: 'Satu' })).tasks.map((t) => t.id)).toEqual([a]);
    expect((await listTasks(projectId, { priority: 'urgent,low', sort: '-priority' })).tasks.map((t) => t.id)).toEqual([a, b]);
    expect((await listTasks(projectId, { assignee: 'me' })).tasks.map((t) => t.id)).toEqual([a]);
    expect((await listTasks(projectId, { assignee: 'none' })).tasks.map((t) => t.id).sort()).toEqual([b, c].sort());
    expect((await listTasks(projectId, { due: 'overdue' })).tasks.map((t) => t.id)).toEqual([a]);
    const p1 = await listTasks(projectId, { per_page: 2, page: 1, sort: 'code' });
    expect(p1.meta).toMatchObject({ page: 1, per_page: 2, total: 3, total_pages: 2 });
    expect((await listTasks(projectId, { per_page: 2, page: 2, sort: 'code' })).tasks).toHaveLength(1);
    const bad = await listTasks(projectId, { sort: 'drop_table' }).catch((e: unknown) => e);
    expect(status(bad)).toBe(400);
  });

  it('panel: patch satu field, null mengosongkan, label, deadline < mulai ditolak 400', async () => {
    const a = taskIds[0] as string;
    expect((await updateTask(a, { description: 'isi' })).description).toBe('isi');
    expect((await updateTask(a, { description: null, assignee_id: null, due_date: null })).due_date).toBeNull();
    expect((await updateTask(a, { labels: ['x', 'y'] })).labels).toEqual(['x', 'y']);
    await expect(updateTask(a, { start_date: '2026-11-20', due_date: '2026-11-10' })).rejects.toSatisfy((e) => status(e) === 400);
  });

  it('komentar: tulis, edit, comment_count, riwayat; member lain tidak bisa mengedit milik owner (403) tapi bisa membaca', async () => {
    const a = taskIds[0] as string;
    const c = await createComment(a, 'Halo **tim**\nbaris dua 🚀');
    expect(c).toMatchObject({ body: 'Halo **tim**\nbaris dua 🚀', can_edit: true, can_delete: true });
    expect((await updateComment(c.id, 'Halo tim')).edited_at).not.toBeNull();
    expect((await getTask(a)).comment_count).toBe(1);
    expect((await taskActivities(a)).map((x) => x.action)).toEqual(expect.arrayContaining(['comment.created', 'task.created']));
    as(memberSession);
    const seen = (await listComments(a))[0];
    expect(seen).toMatchObject({ can_edit: false, can_delete: false });
    await expect(updateComment(c.id, 'peretas')).rejects.toSatisfy((e) => status(e) === 403);
    await expect(deleteComment(c.id)).rejects.toSatisfy((e) => status(e) === 403);
    // member bukan pembuat tidak boleh menghapus tugas milik owner
    await expect(deleteTask(a)).rejects.toSatisfy((e) => status(e) === 403);
    as(ownerSession);
    await deleteComment(c.id);
    expect((await getTask(a)).comment_count).toBe(0);
  });

  it('arsip: tugas read-only (tulis ditolak 400, baca tetap boleh); hapus tugas oleh pembuat; hapus proyek', async () => {
    const [a, b] = taskIds as [string, string, string];
    await archiveProject(projectId, true);
    await expect(createTask(projectId, { title: 'Baru' })).rejects.toSatisfy((e) => status(e) === 400);
    await expect(moveTask(a, { status: 'done' })).rejects.toSatisfy((e) => status(e) === 400);
    await expect(createComment(a, 'x')).rejects.toSatisfy((e) => status(e) === 400);
    expect((await getBoard(projectId, {})).todo.length + (await getBoard(projectId, {})).in_progress.length).toBeGreaterThan(0);
    await archiveProject(projectId, false);
    await deleteTask(b);
    await expect(getTask(b)).rejects.toSatisfy((e) => status(e) === 404);
    await deleteProject(projectId, 'Proyek F3');
    expect(memberId).not.toBe('');
  });
});
