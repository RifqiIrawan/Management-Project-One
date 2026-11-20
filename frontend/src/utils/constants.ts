import type { TaskPriority, TaskStatus } from '@/types/api';

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: string }> = {
  todo: { label: 'To Do', color: '#64748B', icon: 'bi-circle' },
  in_progress: { label: 'In Progress', color: '#3B82F6', icon: 'bi-circle-half' },
  in_review: { label: 'In Review', color: '#F59E0B', icon: 'bi-eye' },
  done: { label: 'Done', color: '#10B981', icon: 'bi-check-circle-fill' },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  low: { label: 'Low', color: '#94A3B8', icon: 'bi-arrow-down' },
  medium: { label: 'Medium', color: '#3B82F6', icon: 'bi-dash' },
  high: { label: 'High', color: '#F97316', icon: 'bi-arrow-up' },
  urgent: { label: 'Urgent', color: '#EF4444', icon: 'bi-exclamation-triangle-fill' },
};