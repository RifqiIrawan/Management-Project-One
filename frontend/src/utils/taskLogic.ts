import type { Params } from '@/api/tasks.api';
import type { Board, Task, TaskStatus } from '@/types/api';
import { STATUSES } from './constants';

/** Jarak posisi saat menaruh kartu di ujung kolom (sama dengan backend: MIN(position) - 1024). */
export const POSITION_STEP = 1024;

/**
 * Posisi desimal untuk kartu yang dijatuhkan di antara dua tetangga.
 * - kolom kosong -> undefined (backend menaruh di paling atas)
 * - paling atas -> di bawah posisi tetangga pertama; paling bawah -> di atas tetangga terakhir
 * - di antara -> titik tengah (tidak perlu menulis ulang kartu lain)
 */
export function computePosition(prev: number | undefined, next: number | undefined): number | undefined {
  if (prev === undefined && next === undefined) return undefined;
  if (prev === undefined) return (next as number) - POSITION_STEP;
  if (next === undefined) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

export type Columns = Record<TaskStatus, Task[]>;

export const columnsFromBoard = (b: Board): Columns => ({ todo: b.todo, in_progress: b.in_progress, in_review: b.in_review, done: b.done });

/** Kolom tempat sebuah tugas berada, atau undefined. */
export function findColumn(cols: Columns, taskId: string): TaskStatus | undefined {
  return STATUSES.find((s) => cols[s].some((t) => t.id === taskId));
}

/**
 * Memindahkan kartu pada salinan kolom (dipakai saat drag berlangsung dan saat dilepas).
 * overId boleh id kartu lain atau nama kolom (dijatuhkan di area kosong -> ke akhir kolom).
 */
export function moveInColumns(cols: Columns, activeId: string, overId: string): Columns {
  const from = findColumn(cols, activeId);
  const to = (STATUSES as string[]).includes(overId) ? (overId as TaskStatus) : findColumn(cols, overId);
  if (!from || !to) return cols;
  const card = cols[from].find((t) => t.id === activeId) as Task;
  const source = cols[from].filter((t) => t.id !== activeId);
  const target = from === to ? source : [...cols[to]];
  const overIndex = target.findIndex((t) => t.id === overId);
  const originalIndex = cols[from].findIndex((t) => t.id === activeId);
  let index = overIndex < 0 ? target.length : overIndex;
  // dalam kolom yang sama, menjatuhkan ke kartu di bawahnya berarti setelah kartu itu
  if (from === to && overIndex >= 0 && originalIndex < cols[from].findIndex((t) => t.id === overId)) index = overIndex + 1;
  const moved = { ...card, status: to };
  const next = [...target.slice(0, index), moved, ...target.slice(index)];
  return from === to ? { ...cols, [to]: next } : { ...cols, [from]: source, [to]: next };
}

/** Body untuk PATCH /tasks/:id/move berdasarkan posisi akhir kartu pada kolom. */
export function planMove(cols: Columns, taskId: string): { status: TaskStatus; position?: number } | null {
  const status = findColumn(cols, taskId);
  if (!status) return null;
  const list = cols[status];
  const i = list.findIndex((t) => t.id === taskId);
  const position = computePosition(list[i - 1]?.position, list[i + 1]?.position);
  return position === undefined ? { status } : { status, position };
}

/** Terapkan hasil pemindahan ke kolom: posisi baru dan (bila ada) status baru pada kartu. */
export function applyPlan(cols: Columns, taskId: string, plan: { status: TaskStatus; position?: number }): Columns {
  if (plan.position === undefined) return cols;
  return { ...cols, [plan.status]: cols[plan.status].map((t) => (t.id === taskId ? { ...t, position: plan.position as number } : t)) };
}

export interface TaskFilters {
  q: string;
  status: string[];
  priority: string[];
  assignee: string[];
  due: string[];
  sort: string;
  page: number;
}

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function filtersFromSearch(sp: URLSearchParams): TaskFilters {
  const page = Number(sp.get('page'));
  return {
    q: sp.get('q') ?? '',
    status: csv(sp.get('status')),
    priority: csv(sp.get('priority')),
    assignee: csv(sp.get('assignee')),
    due: csv(sp.get('due')),
    sort: sp.get('sort') ?? '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Parameter query untuk backend; filter kosong tidak dikirim. */
export function filtersToParams(f: TaskFilters, extra: Params = {}): Params {
  const p: Params = { ...extra };
  if (f.q.trim()) p['q'] = f.q.trim();
  if (f.status.length) p['status'] = f.status.join(',');
  if (f.priority.length) p['priority'] = f.priority.join(',');
  if (f.assignee.length) p['assignee'] = f.assignee.join(',');
  if (f.due.length) p['due'] = f.due.join(',');
  if (f.sort) p['sort'] = f.sort;
  return p;
}

export const hasActiveFilters = (f: TaskFilters) => !!(f.q.trim() || f.status.length || f.priority.length || f.assignee.length || f.due.length);

/** Urutan sort berikutnya untuk klik kepala kolom: menaik -> menurun -> default. */
export function nextSort(current: string, column: string): string {
  if (current === column) return `-${column}`;
  if (current === `-${column}`) return '';
  return column;
}
