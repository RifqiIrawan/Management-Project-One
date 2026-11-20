import type { TaskPriority, TaskStatus } from '@/types/api';

// color = warna teks chip (cukup gelap di atas latar 9%); dot = titik kolom Kanban (mockup).
// fill = warna penuh header kolom Kanban; teksnya selalu putih (warna digelapkan otomatis bila perlu).
export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; fill: string; icon: string }> = {
  todo: { label: 'To Do', color: '#475467', fill: '#667085', icon: 'bi-circle' },
  in_progress: { label: 'In Progress', color: '#2F49B0', fill: '#3B5BDB', icon: 'bi-circle-half' },
  in_review: { label: 'In Review', color: '#B93815', fill: '#E8590C', icon: 'bi-eye' },
  done: { label: 'Done', color: '#067647', fill: '#0F9D58', icon: 'bi-check-circle-fill' },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  low: { label: 'Low', color: '#475467', icon: 'bi-arrow-down' },
  medium: { label: 'Medium', color: '#B54708', icon: 'bi-dash' },
  high: { label: 'High', color: '#C4320A', icon: 'bi-arrow-up' },
  urgent: { label: 'Urgent', color: '#B42318', icon: 'bi-exclamation-triangle-fill' },
};

/** Palet chip label (mockup: UI/UX ungu, Backend teal, Bug merah, QA abu). Warna dipilih stabil dari teks label. */
const LABEL_COLORS = ['#6941C6', '#0E7066', '#B42318', '#475467', '#2F49B0', '#B93815'];
export function labelColor(label: string): string {
  let h = 0;
  for (const ch of label.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length] as string;
}

export const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];
export const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
export const DUE_OPTIONS = [
  { value: 'overdue', label: 'Terlambat' },
  { value: 'today', label: 'Hari ini' },
  { value: 'week', label: 'Minggu ini' },
  { value: 'none', label: 'Tanpa deadline' },
] as const;
