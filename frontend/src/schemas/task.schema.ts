import { z } from 'zod';

// Aturan sama dengan backend/internal/dto/task_dto.go dan docs/features/04-tasks.md.
const title = z.string().trim().min(1, 'Judul wajib diisi').max(200, 'Judul maksimal 200 karakter');
const date = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Tanggal tidak valid');

export const createTaskSchema = z
  .object({
    title,
    description: z.string().max(20000, 'Deskripsi maksimal 20.000 karakter'),
    status: z.enum(['todo', 'in_progress', 'in_review', 'done']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    assignee_id: z.string(),
    start_date: date,
    due_date: date,
    labels: z.string(),
  })
  .refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, { path: ['due_date'], message: 'Deadline tidak boleh sebelum tanggal mulai' });

export type CreateTaskForm = z.input<typeof createTaskSchema>;

/** "a, b, c" -> ['a','b','c']: dipangkas, tanpa kosong dan tanpa duplikat (tanpa beda huruf besar/kecil). */
export function parseLabels(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const l = raw.trim();
    if (l && !seen.has(l.toLowerCase())) {
      seen.add(l.toLowerCase());
      out.push(l);
    }
  }
  return out;
}

export function validateLabels(labels: string[]): string | null {
  if (labels.length > 5) return 'Maksimal 5 label';
  if (labels.some((l) => l.length > 30)) return 'Setiap label maksimal 30 karakter';
  return null;
}
