import { PRIORITY_CONFIG, STATUS_CONFIG } from '@/utils/constants';
import { shortDate } from '@/utils/format';
import type { Task, TaskPriority, TaskStatus } from '@/types/api';

export function StatusBadge({ status }: { status: TaskStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className="badge rounded-pill" style={{ background: c.color }}>
      {c.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const c = PRIORITY_CONFIG[priority];
  return (
    <span className="badge" style={{ background: c.color }} title={`Prioritas ${c.label}`}>
      <i className={`bi ${c.icon} me-1`} aria-hidden="true" />
      {c.label}
    </span>
  );
}

/** Tanggal deadline; merah bila lewat dan belum selesai. Perbandingan string YYYY-MM-DD aman (urut leksikal). */
export function isOverdue(task: Pick<Task, 'due_date' | 'status'>, today: string): boolean {
  return !!task.due_date && task.status !== 'done' && task.due_date < today;
}

export function DueDate({ task, today }: { task: Pick<Task, 'due_date' | 'status'>; today: string }) {
  if (!task.due_date) return null;
  const late = isOverdue(task, today);
  return (
    <span className={`small ${late ? 'text-danger fw-semibold' : 'text-secondary'}`} title={late ? 'Terlambat' : 'Deadline'}>
      <i className="bi bi-calendar-event me-1" aria-hidden="true" />
      {late && <span className="visually-hidden">Terlambat: </span>}
      {shortDate(task.due_date)}
    </span>
  );
}

/** Hari ini menurut jam lokal browser dalam format YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}
