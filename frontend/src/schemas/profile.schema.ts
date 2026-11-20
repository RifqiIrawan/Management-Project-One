import { z } from 'zod';
import { passwordRule } from './auth.schema';

// Aturan sama dengan backend/internal/dto/auth_dto.go.
export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter'),
  avatar_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Warna tidak valid'),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Password saat ini wajib diisi'),
    new_password: passwordRule,
    confirm_password: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((v) => v.new_password === v.confirm_password, { path: ['confirm_password'], message: 'Konfirmasi password tidak sama' });

export type ProfileForm = z.input<typeof profileSchema>;
export type ChangePasswordForm = z.input<typeof changePasswordSchema>;
