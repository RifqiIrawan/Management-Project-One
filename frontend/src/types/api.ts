// Tipe domain diturunkan dari kontrak (src/types/api.generated.ts, dihasilkan dari backend/docs/openapi.yaml).
import type { components } from './api.generated';

type S = components['schemas'];
export type User = S['User'];
export type Auth = S['Auth'];
export type UserRef = S['UserRef'];
export type Project = S['Project'];
export type Task = S['Task'];
export type TaskStatus = S['TaskStatus'];
export type TaskPriority = S['TaskPriority'];
export type PageMeta = S['PageMeta'];

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: Record<string, string> };
}
export interface ApiOk<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}
export type Role = S['Role'];
export type Member = S['Member'];
export type MemberPreview = S['MemberPreview'];
export type UserSummary = S['UserSummary'];
export type ProjectRef = S['ProjectRef'];
export type Activity = S['Activity'];
export type Dashboard = S['Dashboard'];
export type DashboardTask = S['DashboardTask'];
export type DashboardStats = S['DashboardStats'];
export type CreateProjectRequest = S['CreateProjectRequest'];
export type UpdateProjectRequest = S['UpdateProjectRequest'];

export type Board = S['Board'];
export type Comment = S['Comment'];
export type CreateTaskRequest = S['CreateTaskRequest'];
export type UpdateTaskRequest = S['UpdateTaskRequest'];
export type MoveTaskRequest = S['MoveTaskRequest'];

export type MyTasksGrouped = S['MyTasksGrouped'];
