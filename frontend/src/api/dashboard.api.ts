import { api } from './axios';
import { qk } from './projects.api';
import type { ApiOk, Dashboard, Task } from '@/types/api';

export async function getDashboard(): Promise<Dashboard> {
  return (await api.get<ApiOk<Dashboard>>('/dashboard')).data.data;
}

/** Kunci di bawah awalan ['dashboard'] agar ikut dimuat ulang saat tugas/proyek berubah. */
export const myTasksKey = [...qk.dashboard, 'my-tasks'] as const;

/** Tugas yang di-assign ke saya (termasuk yang selesai), lintas proyek, deadline terdekat dulu. */
export async function listMyTasks(): Promise<Task[]> {
  return (await api.get<ApiOk<Task[]>>('/me/tasks', { params: { include_done: true, per_page: 10 } })).data.data;
}
