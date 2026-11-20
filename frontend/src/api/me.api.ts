import { api } from './axios';
import { qk } from './projects.api';
import { useAuthStore } from '@/store/authStore';
import type { ApiOk, Auth, MyTasksGrouped, Task, User } from '@/types/api';

export type Params = Record<string, string | number | boolean>;

/** Di bawah awalan ['dashboard'] agar ikut dimuat ulang saat tugas/proyek berubah (jumlah di sidebar ikut segar). */
export const myGroupedKey = (params: Params) => [...qk.dashboard, 'my-tasks-grouped', params] as const;
export const paletteTasksKey = (q: string) => ['palette', 'tasks', q] as const;

/** Tugas saya lintas proyek, dikelompokkan menurut deadline (overdue/today/this_week/later/no_deadline). */
export async function listMyTasksGrouped(params: Params): Promise<MyTasksGrouped> {
  return (await api.get<ApiOk<MyTasksGrouped>>('/me/tasks', { params: { ...params, group: 'due' } })).data.data;
}

/** Pencarian cepat (Ctrl+K): judul atau kode tugas milik saya, termasuk yang selesai. */
export async function searchMyTasks(q: string): Promise<Task[]> {
  return (await api.get<ApiOk<Task[]>>('/me/tasks', { params: { q, include_done: true, per_page: 6 } })).data.data;
}

export interface ProfileInput {
  name?: string;
  avatar_color?: string;
}

/** Ubah nama/warna avatar lalu perbarui profil di memori (sidebar, topbar, avatar ikut berubah). */
export async function updateMe(input: ProfileInput): Promise<User> {
  const u = (await api.patch<ApiOk<User>>('/me', input)).data.data;
  useAuthStore.getState().setUser(u);
  return u;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

/** Semua sesi lain dicabut; server membalas sesi baru untuk perangkat ini (token + kunci tanda tangan baru). */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const r = await api.patch<ApiOk<Auth>>('/me/password', input);
  useAuthStore.getState().setSession(r.data.data);
}

/** Cabut semua sesi di semua perangkat, lalu kosongkan sesi lokal. */
export async function logoutAll(): Promise<void> {
  try {
    await api.post('/auth/logout-all');
  } finally {
    useAuthStore.getState().clear();
  }
}
