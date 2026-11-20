import Avatar from '@/components/common/Avatar';
import type { Task } from '@/types/api';
import { nextSort } from '@/utils/taskLogic';
import { DueDate, PriorityBadge, StatusBadge, localToday } from './badges';

interface Props {
  tasks: Task[];
  sort: string;
  onSort: (sort: string) => void;
  onOpen: (task: Task) => void;
}

const COLUMNS: { key: string; label: string }[] = [
  { key: 'code', label: 'Kode' },
  { key: 'title', label: 'Judul' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Prioritas' },
  { key: 'due_date', label: 'Deadline' },
];

export default function TaskTable({ tasks, sort, onSort, onOpen }: Props) {
  const ariaSort = (key: string) => (sort === key ? 'ascending' : sort === `-${key}` ? 'descending' : 'none');
  const today = localToday();
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle bg-body">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" aria-sort={ariaSort(c.key)}>
                <button type="button" className="btn btn-link p-0 text-body fw-semibold text-decoration-none" onClick={() => onSort(nextSort(sort, c.key))}>
                  {c.label}
                  {sort === c.key && <i className="bi bi-caret-up-fill ms-1" aria-hidden="true" />}
                  {sort === `-${c.key}` && <i className="bi bi-caret-down-fill ms-1" aria-hidden="true" />}
                </button>
              </th>
            ))}
            <th scope="col">Penanggung jawab</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td className="text-secondary small text-nowrap">{t.code}</td>
              <td>
                <button type="button" className="btn btn-link p-0 text-start text-body text-decoration-none fw-medium" onClick={() => onOpen(t)}>
                  {t.title}
                </button>
                {t.comment_count > 0 && (
                  <span className="small text-secondary ms-2">
                    <i className="bi bi-chat" aria-hidden="true" /> {t.comment_count}
                    <span className="visually-hidden"> komentar</span>
                  </span>
                )}
              </td>
              <td>
                <StatusBadge status={t.status} />
              </td>
              <td>
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="text-nowrap">{t.due_date ? <DueDate task={t} today={today} /> : <span className="text-secondary">-</span>}</td>
              <td>
                {t.assignee ? (
                  <span className="d-inline-flex align-items-center gap-2">
                    <Avatar name={t.assignee.name} color={t.assignee.avatar_color} size={24} />
                    <span className="small">{t.assignee.name}</span>
                  </span>
                ) : (
                  <span className="text-secondary small">Belum ada</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
