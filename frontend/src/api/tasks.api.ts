import { api } from './axios';
import type { Activity, ApiOk, Board, Comment, CreateTaskRequest, MoveTaskRequest, PageMeta, Task, UpdateTaskRequest } from '@/types/api';

export type Params = Record<string, string | number | boolean>;

export const tk = {
  /** Awalan semua daftar tugas satu proyek (dipakai untuk invalidasi). */
  tasks: (projectId: string) => ['project', projectId, 'tasks'] as const,
  board: (projectId: string, params: Params) => ['project', projectId, 'tasks', 'board', params] as const,
  list: (projectId: string, params: Params) => ['project', projectId, 'tasks', 'list', params] as const,
  task: (taskId: string) => ['task', taskId] as const,
  comments: (taskId: string) => ['task', taskId, 'comments'] as const,
  activities: (taskId: string) => ['task', taskId, 'activities'] as const,
};

const unwrap = <T>(r: { data: ApiOk<T> }): T => r.data.data;

export const getBoard = (projectId: string, params: Params) => api.get<ApiOk<Board>>(`/projects/${projectId}/tasks`, { params: { ...params, view: 'board' } }).then(unwrap);

export async function listTasks(projectId: string, params: Params): Promise<{ tasks: Task[]; meta: PageMeta }> {
  const r = await api.get<ApiOk<Task[]>>(`/projects/${projectId}/tasks`, { params: { ...params, view: 'list' } });
  return { tasks: r.data.data, meta: r.data.meta as PageMeta };
}

export const createTask = (projectId: string, body: CreateTaskRequest) => api.post<ApiOk<Task>>(`/projects/${projectId}/tasks`, body).then(unwrap);
export const getTask = (taskId: string) => api.get<ApiOk<Task>>(`/tasks/${taskId}`).then(unwrap);
export const updateTask = (taskId: string, body: UpdateTaskRequest) => api.patch<ApiOk<Task>>(`/tasks/${taskId}`, body).then(unwrap);
export const moveTask = (taskId: string, body: MoveTaskRequest) => api.patch<ApiOk<Task>>(`/tasks/${taskId}/move`, body).then(unwrap);
export const deleteTask = (taskId: string) => api.delete(`/tasks/${taskId}`);

export async function listComments(taskId: string): Promise<Comment[]> {
  return (await api.get<ApiOk<Comment[]>>(`/tasks/${taskId}/comments`, { params: { per_page: 100 } })).data.data;
}
export const createComment = (taskId: string, body: string) => api.post<ApiOk<Comment>>(`/tasks/${taskId}/comments`, { body }).then(unwrap);
export const updateComment = (commentId: string, body: string) => api.patch<ApiOk<Comment>>(`/comments/${commentId}`, { body }).then(unwrap);
export const deleteComment = (commentId: string) => api.delete(`/comments/${commentId}`);
export async function taskActivities(taskId: string): Promise<Activity[]> {
  return (await api.get<ApiOk<Activity[]>>(`/tasks/${taskId}/activities`, { params: { per_page: 50 } })).data.data;
}
