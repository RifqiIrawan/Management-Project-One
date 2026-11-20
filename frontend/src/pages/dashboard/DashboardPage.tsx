import { useAuthStore } from '@/store/authStore';

/** Sapaan menurut jam lokal browser. */
export function greeting(hour: number): string {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <section>
      <h1 className="h3 fw-bold">
        {greeting(new Date().getHours())}, {user?.name ?? ''} 👋
      </h1>
      <p className="text-secondary">Dashboard lengkap (statistik, tugas jatuh tempo, proyek) hadir di tahap F2.</p>
    </section>
  );
}