import type { MemberPreview } from '@/types/api';
import Avatar from './Avatar';

export default function AvatarStack({ members, total }: { members: MemberPreview[]; total: number }) {
  const extra = total - members.length;
  return (
    <div className="d-flex align-items-center">
      {members.map((m) => (
        <span key={m.id} className="avatar-stack-item">
          <Avatar name={m.name} color={m.avatar_color} size={26} />
        </span>
      ))}
      {extra > 0 && <span className="small text-secondary ms-2">+{extra}</span>}
    </div>
  );
}
