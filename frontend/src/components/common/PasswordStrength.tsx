import { passwordStrength } from '@/schemas/auth.schema';

const STRENGTH = [
  { label: 'Sangat lemah', color: '#ef4444' },
  { label: 'Lemah', color: '#f97316' },
  { label: 'Cukup', color: '#f59e0b' },
  { label: 'Kuat', color: '#10b981' },
  { label: 'Sangat kuat', color: '#059669' },
];

/** Indikator kekuatan password (bukan pengganti validasi server). Kosong -> tidak tampil. */
export default function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const s = passwordStrength(value);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="strength-bar">
        <span style={{ width: `${((s + 1) / 5) * 100}%`, background: STRENGTH[s]?.color }} />
      </div>
      <small className="text-secondary">Kekuatan: {STRENGTH[s]?.label}</small>
    </div>
  );
}
