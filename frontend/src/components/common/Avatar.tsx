import { initials } from '@/utils/format';

interface Props {
  name: string;
  color?: string;
  size?: number;
}

/** Avatar pastel (mockup): latar = 28% dari warna akun di atas putih, teks gelap. */
export default function Avatar({ name, color = '#6366F1', size = 32 }: Props) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 28%, #fff)`, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      role="img"
      aria-label={name}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
