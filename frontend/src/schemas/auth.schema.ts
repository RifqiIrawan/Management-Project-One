import { z } from 'zod';

// Aturan sama dengan backend (min 8 karakter, huruf dan angka, maks 72 byte).
export const passwordRule = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'Password terlalu panjang (maks 72 byte)')
  .refine((v) => /\p{L}/u.test(v) && /\p{N}/u.test(v), 'Password harus mengandung huruf dan angka');

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter'),
    email: z.string().trim().min(1, 'Email wajib diisi').email('Format email tidak valid').max(150, 'Email maksimal 150 karakter'),
    password: passwordRule,
    confirm_password: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((v) => v.password === v.confirm_password, { path: ['confirm_password'], message: 'Konfirmasi password tidak sama' });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterFormInput = z.infer<typeof registerSchema>;

/** Skor kekuatan 0-4 untuk indikator (bukan pengganti validasi server). */
export function passwordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/\p{L}/u.test(pw) && /\p{N}/u.test(pw)) score++;
  if (/[^\p{L}\p{N}]/u.test(pw) || (/\p{Lu}/u.test(pw) && /\p{Ll}/u.test(pw))) score++;
  return Math.min(score, 4);
}