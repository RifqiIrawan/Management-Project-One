// Hanya untuk development: akun demo satu klik. Dipakai di LoginPage di balik import.meta.env.DEV,
// sehingga tidak ikut ke build production.
import { isAxiosError } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { login, register } from './auth.api';
import { createProject } from './projects.api';
import { createTask } from './tasks.api';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'Demo12345';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function seed(userId: string): Promise<void> {
  const p = await createProject({ name: 'Proyek Demo', key: 'DEMO', description: 'Contoh proyek untuk mencoba board, filter, dan komentar.', color: '#6366F1', icon: '🚀' });
  const tasks = [
    { title: 'Rancang halaman login', status: 'done', priority: 'high', labels: ['desain'] },
    { title: 'Buat API produk', status: 'in_review', priority: 'high', due_date: day(2), labels: ['backend'] },
    { title: 'Perbaiki bug keranjang belanja', status: 'in_progress', priority: 'urgent', due_date: day(-1), labels: ['bug'] },
    { title: 'Tambah halaman profil', status: 'in_progress', priority: 'medium', due_date: day(3), labels: ['frontend'] },
    { title: 'Tulis dokumentasi API', status: 'todo', priority: 'low', labels: ['docs'] },
    { title: 'Uji coba di perangkat seluler', status: 'todo', priority: 'medium', due_date: day(7) },
    { title: 'Siapkan backup database', status: 'todo', priority: 'high', due_date: day(5), labels: ['ops'] },
  ] as const;
  // sebagian besar di-assign ke akun demo agar statistik dashboard dan filter "Saya" langsung berisi
  for (const [i, t] of tasks.entries()) await createTask(p.id, { ...t, labels: 'labels' in t ? [...t.labels] : [], ...(i !== 4 ? { assignee_id: userId } : {}) });
}

const STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const VERBS = ['Rancang', 'Bangun', 'Perbaiki', 'Uji', 'Tinjau', 'Dokumentasikan', 'Optimalkan', 'Siapkan'];
const NOUNS = ['halaman beranda', 'modul laporan', 'form pendaftaran', 'API pembayaran', 'dashboard admin', 'notifikasi email', 'pencarian produk', 'autentikasi'];
const LABELS = ['frontend', 'backend', 'bug', 'desain', 'docs', 'qa'];

/** Proyek tambahan berwarna kuat dengan banyak tugas, untuk mencoba tabel padat dan filter. */
async function seedExtra(userId: string): Promise<void> {
  const specs = [
    { key: 'WEB', name: 'Website Company Profile', color: '#E64980', icon: '🌐', n: 14 },
    { key: 'MOB', name: 'Aplikasi Mobile Kasir', color: '#12B76A', icon: '📱', n: 10 },
  ];
  for (const sp of specs) {
    const p = await createProject({ name: sp.name, key: sp.key, color: sp.color, icon: sp.icon, description: 'Proyek contoh untuk uji tampilan.' });
    for (let i = 0; i < sp.n; i++) {
      await createTask(p.id, {
        title: `${VERBS[i % VERBS.length]} ${NOUNS[(i * 3) % NOUNS.length]}`,
        status: STATUSES[(i * 3) % 4] as (typeof STATUSES)[number],
        priority: PRIORITIES[(i * 5) % 4] as (typeof PRIORITIES)[number],
        labels: [LABELS[i % LABELS.length] as string],
        ...(i % 3 !== 2 ? { assignee_id: userId } : {}),
        ...(i % 4 !== 3 ? { due_date: day((i % 21) - 6) } : {}),
      });
    }
  }
}

/** Masuk sebagai akun demo; bila belum ada, dibuat beserta data contoh. */
export async function loginDemo(): Promise<void> {
  try {
    await login(DEMO_EMAIL, DEMO_PASSWORD);
  } catch (e) {
    if (!isAxiosError(e) || e.response?.status !== 401) throw e;
    await register({ name: 'Demo User', email: DEMO_EMAIL, password: DEMO_PASSWORD, confirm_password: DEMO_PASSWORD });
    const uid = useAuthStore.getState().user?.id ?? '';
    await seed(uid);
    await seedExtra(uid);
  }
}
