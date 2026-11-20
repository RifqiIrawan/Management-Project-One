import { api } from './axios';
import type { ApiOk, Dashboard } from '@/types/api';

export async function getDashboard(): Promise<Dashboard> {
  return (await api.get<ApiOk<Dashboard>>('/dashboard')).data.data;
}
