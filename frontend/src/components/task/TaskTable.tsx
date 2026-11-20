import Avatar from '@/components/common/Avatar';
import { COLUMN_DEFS, type Density } from '@/store/viewStore';
import type { Task } from '@/types/api';
import { labelColor, PRIORITY_CONFIG } from '@/utils/constants';
import { fullDate, shortDate, timeAgo } from '@/utils/format';
import { nextSort } from '@/utils/taskLogic';
import { DueDate, PriorityBadge, StatusBadge, localToday } from './badges';

interface Props {
  tasks: Task[];
  sort: string;
  onSort: (sort: string) => void;
  onOpen: (task: Task) => void;
  /** Id kolom yang tampil (lihat COLUMN_DEFS), sudah berurutan. */
  columns: string[];
  density: Density;
}

const dash = <span className="text-secondary">-</span>;

export default function TaskTable({ tasks, sort, onSort, onOpen, columns, density }: Props) {
  const today = localToday();
  const defs = COLUMN_DEFS.filter((c) => columns.includes(c.id));
  const ariaSort = (key: string) => (sort === key ? 'ascending' : sort === `-${key}` ? 'descending' : 'none');

  function cell(id: string, t: Task) {
    switch (id) {
      case 'code':
        return <span className="task-code text-nowrap">{t.code}</span>;
      case 'title':
        return (
          <button
            type="button"
            className="btn btn-link p-0 text-start text-body fw-medium row-title"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(t);
            }}
          >
            {t.title}
          </button>
        );
      case 'status':
        return <StatusBadge status={t.status} />;
      case 'priority':
        return <PriorityBadge priority={t.priority} />;
      case 'assignee':
        return t.assignee ? (
          <span className="d-inline-flex align-items-center gap-2 text-nowrap">
            <Avatar name={t.assignee.name} color={t.assignee.avatar_color} size={density === 'compact' ? 20 : 24} />
            <span>{t.assignee.name}</span>
          </span>
        ) : (
          <span className="text-secondary text-nowrap">Belum ada</span>
        );
      case 'labels':
        return t.labels.length === 0 ? (
          dash
        ) : (
          <span className="d-inline-flex gap-1 text-nowrap" title={t.labels.join(', ')}>
            {t.labels.slice(0, 2).map((l) => (
              <span key={l} className="tint" style={{ '--c': labelColor(l) } as React.CSSProperties}>
                {l}
              </span>
            ))}
            {t.labels.length > 2 && <span className="tint">+{t.labels.length - 2}</span>}
          </span>
        );
      case 'start_date':
        return t.start_date ? <span className="text-nowrap">{shortDate(t.start_date)}</span> : dash;
      case 'due_date':
        return t.due_date ? <DueDate task={t} today={today} /> : dash;
      case 'comments':
        return t.comment_count > 0 ? (
          <span className="small text-secondary text-nowrap">
            <i className="bi bi-chat" aria-hidden="true" /> {t.comment_count}
            <span className="visually-hidden"> komentar</span>
          </span>
        ) : (
          dash
        );
      case 'updated_at':
        return <span className="small text-secondary text-nowrap">{timeAgo(t.updated_at)}</span>;
      case 'created_at':
        return <span className="small text-secondary text-nowrap">{fullDate(t.created_at)}</span>;
      default:
        return null;
    }
  }

  return (
    <div className={`table-responsive dense-scroll table-${density}`}>
      <table className="table table-hover align-middle task-table">
        <thead>
          <tr>
            {defs.map((c) => (
              <th key={c.id} scope="col" aria-sort={c.sort ? ariaSort(c.sort) : undefined}>
                {c.sort ? (
                  <button type="button" className="btn btn-link p-0 text-body fw-semibold text-decoration-none" onClick={() => onSort(nextSort(sort, c.sort as string))}>
                    {c.label}
                    {sort === c.sort && <i className="bi bi-caret-up-fill ms-1" aria-hidden="true" />}
                    {sort === `-${c.sort}` && <i className="bi bi-caret-down-fill ms-1" aria-hidden="true" />}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="task-row" style={{ '--stripe': PRIORITY_CONFIG[t.priority].color } as React.CSSProperties} onClick={() => onOpen(t)}>
              {defs.map((c) => (
                <td key={c.id} className={c.id === 'title' ? 'col-title' : undefined}>
                  {cell(c.id, t)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
