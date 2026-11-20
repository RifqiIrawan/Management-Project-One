import { initials } from '@/utils/format';

interface Props {
  name: string;
  color?: string;
  size?: number;
}

export default function Avatar({ name, color = '#6366F1', size = 32 }: Props) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.4) }}
      role="img"
      aria-label={name}
      title={name}
    >
      {initials(name)}
    </span>
  );
}