import { api } from './axios';
import type { ApiOk, CreateProjectRequest, Member, Project, Role, UpdateProjectRequest, UserSummary } from '@/types/api';

export const qk = {
  dashboard: ['dashboard'] as const,
  projects: (q: string, archived: boolean) => ['projects', { q, archived }] as const,
  projectsAll: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  members: (id: string) => ['project', id, 'members'] as const,
};

const unwrap = <T>(r: { data: ApiOk<T> }): T => r.data.data;

export const listProjects = (q = '', archived = false) =>
  api.get<ApiOk<Project[]>>('/projects', { params: { ...(q ? { q } : {}), archived } }).then(unwrap);
export const getProject = (id: string) => api.get<ApiOk<Project>>(`/projects/${id}`).then(unwrap);
export const createProject = (body: CreateProjectRequest) => api.post<ApiOk<Project>>('/projects', body).then(unwrap);
export const updateProject = (id: string, body: UpdateProjectRequest) => api.patch<ApiOk<Project>>(`/projects/${id}`, body).then(unwrap);
export const archiveProject = (id: string, archived: boolean) => api.post<ApiOk<Project>>(`/projects/${id}/archive`, { archived }).then(unwrap);
export const deleteProject = (id: string, confirm_name: string) => api.delete(`/projects/${id}`, { data: { confirm_name } });
export const toggleFavorite = (id: string) => api.post<ApiOk<{ is_favorite: boolean }>>(`/projects/${id}/favorite`).then(unwrap);

export const listMembers = (id: string) => api.get<ApiOk<Member[]>>(`/projects/${id}/members`).then(unwrap);
export const addMember = (id: string, email: string, role: Role = 'member') => api.post<ApiOk<Member>>(`/projects/${id}/members`, { email, role }).then(unwrap);
export const updateMemberRole = (id: string, userId: string, role: Role) => api.patch<ApiOk<Member>>(`/projects/${id}/members/${userId}`, { role }).then(unwrap);
export const removeMember = (id: string, userId: string) => api.delete(`/projects/${id}/members/${userId}`);
export const searchUsers = (email: string) => api.get<ApiOk<UserSummary[]>>('/users/search', { params: { email } }).then(unwrap);
