import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Avatar from '@/components/common/Avatar';
import type { Task } from '@/types/api';
import { DueDate, PriorityBadge, localToday } from './badges';

interface Props {
  task: Task;
  onOpen: (task: Task) => void;
  disabled?: boolean;
  overlay?: boolean;
}

/** Isi kartu (dipakai juga untuk bayangan saat drag). */
export function TaskCardBody({ task, onOpen }: { task: Task; onOpen?: (t: Task) => void }) {
  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-1">
        <span className="small text-secondary">{task.code}</span>
        <span className="ms-auto">
          <PriorityBadge priority={task.priority} />
        </span>
      </div>
      {onOpen ? (
        <button type="button" className="btn btn-link p-0 text-start text-body text-decoration-none fw-medium task-title" onClick={() => onOpen(task)}>
          {task.title}
        </button>
      ) : (
        <div className="fw-medium">{task.title}</div>
      )}
      {task.labels.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mt-2">
          {task.labels.map((l) => (
            <span key={l} className="badge text-bg-light border">
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="d-flex align-items-center gap-2 mt-2">
        <DueDate task={task} today={localToday()} />
        {task.comment_count > 0 && (
          <span className="small text-secondary" title={`${task.comment_count} komentar`}>
            <i className="bi bi-chat me-1" aria-hidden="true" />
            {task.comment_count}
            <span className="visually-hidden"> komentar</span>
          </span>
        )}
        <span className="ms-auto">{task.assignee ? <Avatar name={task.assignee.name} color={task.assignee.avatar_color} size={24} /> : <i className="bi bi-person-dash text-secondary" title="Belum ada penanggung jawab" aria-label="Belum ada penanggung jawab" />}</span>
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
      <div className="card-body p-2">
        <TaskCardBody task={task} onOpen={onOpen} />
      </div>
    </li>
  );
}
