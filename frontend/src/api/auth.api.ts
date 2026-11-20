import { api } from './axios';
import { useAuthStore } from '@/store/authStore';
import type { ApiOk, Auth, User } from '@/types/api';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export async function login(email: string, password: string): Promise<void> {
  const r = await api.post<ApiOk<Auth>>('/auth/login', { email, password });
  useAuthStore.getState().setSession(r.data.data);
}

/** Backend register hanya membuat akun; setelahnya login agar langsung masuk. */
export async function register(input: RegisterInput): Promise<void> {
  await api.post<ApiOk<User>>('/auth/register', input);
  await login(input.email, input.password);
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    useAuthStore.getState().clear();
  }
}

/** Dipanggil saat aplikasi dibuka: tukar cookie refresh token dengan sesi (access token + kunci). */
export async function restoreSession(): Promise<void> {
  try {
    const r = await api.post<ApiOk<Auth>>('/auth/refresh');
    useAuthStore.getState().setSession(r.data.data);
  } catch {
    useAuthStore.getState().clear();
  }
}