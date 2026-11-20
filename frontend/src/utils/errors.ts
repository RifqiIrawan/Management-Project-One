import { isAxiosError } from 'axios';
import type { ApiErrorBody } from '@/types/api';

export interface ParsedError {
  code: string;
  message: string;
  details: Record<string, string>;
}

/** Mengubah error apa pun menjadi pesan yang aman ditampilkan (pesan server bila ada). */
export function parseError(e: unknown): ParsedError {
  if (isAxiosError<ApiErrorBody>(e)) {
    const body = e.response?.data?.error;
    if (body) return { code: body.code, message: body.message, details: body.details ?? {} };
    if (!e.response) return { code: 'NETWORK', message: 'Tidak bisa terhubung ke server. Periksa koneksi Anda.', details: {} };
  }
  return { code: 'UNKNOWN', message: 'Terjadi kesalahan. Coba lagi.', details: {} };
}