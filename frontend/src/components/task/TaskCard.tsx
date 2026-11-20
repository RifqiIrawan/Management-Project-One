import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Avatar from '@/components/common/Avatar';
import type { Task } from '@/types/api';
import { labelColor } from '@/utils/constants';
import { DueDate, PriorityBadge, localToday } from './badges';

interface Props {
  task: Task;
  onOpen: (task: Task) => void;
  disabled?: boolean;
  overlay?: boolean;
}

/** Isi kartu (dipakai juga untuk bayangan saat drag). Susunan mengikuti mockup. */
export function TaskCardBody({ task, onOpen }: { task: Task; onOpen?: (t: Task) => void }) {
  const [firstLabel, ...restLabels] = task.labels;
  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-1 mb-2">
        {firstLabel && (
          <span className="tint" style={{ '--c': labelColor(firstLabel) } as React.CSSProperties} title={task.labels.join(', ')}>
            {firstLabel}
          </span>
        )}
        {restLabels.length > 0 && <span className="tint">+{restLabels.length}</span>}
        <PriorityBadge priority={task.priority} />
      </div>
      {onOpen ? (
        <button type="button" className="btn btn-link p-0 text-start text-body fw-semibold task-title" onClick={() => onOpen(task)}>
          {task.title}
        </button>
      ) : (
        <div className="fw-semibold task-title">{task.title}</div>
      )}
      <div className="task-code mt-1">{task.code}</div>
      <div className="d-flex align-items-center gap-3 mt-2">
        <DueDate task={task} today={localToday()} />
        {task.comment_count > 0 && (
          <span className="small text-secondary d-inline-flex align-items-center gap-1" title={`${task.comment_count} komentar`}>
            <i className="bi bi-chat" aria-hidden="true" />
            {task.comment_count}
            <span className="visually-hidden"> komentar</span>
          </span>
        )}
        <span className="ms-auto">
          {task.assignee ? (
            <Avatar name={task.assignee.name} color={task.assignee.avatar_color} size={26} />
          ) : (
            <i className="bi bi-person-dash text-secondary" title="Belum ada penanggung jawab" aria-label="Belum ada penanggung jawab" />
          )}
        </span>
      </div>
    </>
  );
}

export default function TaskCard({ task, onOpen, disabled = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="card task-card"
      {...attributes}
      {...(disabled ? {} : listeners)}
      aria-roledescription={disabled ? undefined : 'kartu yang bisa dipindah'}
    >
      <div className="card-body p-3">
        <TaskCardBody task={task} onOpen={onOpen} />
      </div>
    </li>
  );
}
