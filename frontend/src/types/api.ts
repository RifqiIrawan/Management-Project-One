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