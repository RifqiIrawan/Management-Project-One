import { z } from 'zod';

// Aturan sama dengan backend/internal/dto/project_dto.go.
export const PROJECT_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6'] as const;

const name = z.string().trim().min(2, 'Nama minimal 2 karakter').max(150, 'Nama maksimal 150 karakter');
const description = z.string().max(5000, 'Deskripsi maksimal 5000 karakter');
const icon = z.string().max(10, 'Ikon terlalu panjang');
const color = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Warna tidak valid');

export const createProjectSchema = z.object({
  name,
  key: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2,5}$/, 'Kode 2-5 huruf (A-Z)')),
  description,
  color,
  icon,
});
export const editProjectSchema = z.object({ name, description, color, icon });
export const inviteSchema = z.object({
  email: z.string().trim().min(1, 'Email wajib diisi').email('Format email tidak valid'),
});

export type CreateProjectForm = z.input<typeof createProjectSchema>;
export type CreateProjectOutput = z.output<typeof createProjectSchema>;
export type EditProjectForm = z.input<typeof editProjectSchema>;

/** Saran kode proyek dari nama: huruf awal kata, atau 3 huruf pertama (maks. 5). */
export function suggestKey(projectName: string): string {
  const words = projectName.toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const joined = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 3);
  return joined.slice(0, 5);
}
