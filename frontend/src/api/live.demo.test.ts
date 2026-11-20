// Tes LANGSUNG (opt-in): akun demo satu klik. Membuat/memakai akun demo@example.com di database yang sedang jalan.
//   LIVE_API_URL=http://localhost:6990/api/v1 npx vitest run src/api/live.demo.test.ts
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { api } from './axios';
import { getDashboard, listMyTasks } from './dashboard.api';
import { DEMO_EMAIL, loginDemo } from './demo';
import { listProjects } from './projects.api';
import { getBoard } from './tasks.api';

const LIVE = process.env['LIVE_API_URL'];
api.defaults.baseURL = LIVE ?? api.defaults.baseURL;

describe.skipIf(!LIVE)('akun demo', () => {
  it('masuk (membuat akun + data contoh bila belum ada), lalu panggilan kedua tidak menggandakan data', async () => {
    await loginDemo();
    expect(useAuthStore.getState().user?.email).toBe(DEMO_EMAIL);
    const demo = (await listProjects()).filter((p) => p.key === 'DEMO');
    expect(demo).toHaveLength(1);
    const board = await getBoard(demo[0]?.id ?? '', {});
    expect(board.todo.length + board.in_progress.length + board.in_review.length + board.done.length).toBe(7);

    // panel "Tugas Saya" di dashboard: /me/tasks?include_done=true&per_page=10 diterima server (bertanda tangan)
    const mine = await listMyTasks();
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThanOrEqual(10); // per_page=10
    expect((await getDashboard()).stats.total_tasks).toBeGreaterThanOrEqual(mine.length);
    expect((await listProjects()).filter((p) => ['DEMO', 'WEB', 'MOB'].includes(p.key)).length).toBe(3); // 3 proyek berwarna berbeda

    useAuthStore.getState().clear();
    await loginDemo();
    expect((await listProjects()).filter((p) => p.key === 'DEMO')).toHaveLength(1);
  });
});
