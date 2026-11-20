import { useQuery } from '@tanstack/react-query';
import { taskActivities, tk } from '@/api/tasks.api';
import Avatar from '@/components/common/Avatar';
import ErrorState from '@/components/common/ErrorState';
import Spinner from '@/components/common/Spinner';
import { parseError } from '@/utils/errors';
import { timeAgo } from '@/utils/format';

export default function ActivityList({ taskId }: { taskId: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: tk.activities(taskId), queryFn: () => taskActivities(taskId) });
  if (isLoading) return <Spinner label="Memuat riwayat..." />;
  if (isError) return <ErrorState message={parseError(error).message} onRetry={() => void refetch()} />;
  if (!data || data.length === 0) return <p className="text-secondary small">Belum ada riwayat.</p>;
  return (
    <ul className="list-unstyled" aria-label="Riwayat">
      {data.map((a) => (
        <li key={a.id} className="d-flex gap-2 mb-2">
          <Avatar name={a.user.name} color={a.user.avatar_color} size={24} />
          <div className="small">
            <div>{a.message}</div>
            <div className="text-secondary">{timeAgo(a.created_at)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
