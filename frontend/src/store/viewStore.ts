import { create } from 'zustand';

/** Preferensi tampilan tugas per perangkat (disimpan di browser): kepadatan, kolom tabel, ukuran halaman. */
export type Density = 'comfortable' | 'compact';

export interface ColumnDef {
  id: string;
  label: string;
  /** Nama kolom sort di backend; tanpa nilai = tidak bisa diurutkan. */
  sort?: string;
  /** Tidak bisa disembunyikan. */
  locked?: boolean;
}

// Urutan di sini = urutan kolom di tabel. Kolom sort sesuai daftar putih backend (docs/features/05).
export const COLUMN_DEFS: ColumnDef[] = [
  { id: 'code', label: 'Kode', sort: 'code' },
  { id: 'title', label: 'Judul', sort: 'title', locked: true },
  { id: 'status', label: 'Status', sort: 'status' },
  { id: 'priority', label: 'Prioritas', sort: 'priority' },
  { id: 'assignee', label: 'Penanggung jawab' },
  { id: 'labels', label: 'Label' },
  { id: 'start_date', label: 'Mulai', sort: 'start_date' },
  { id: 'due_date', label: 'Deadline', sort: 'due_date' },
  { id: 'comments', label: 'Komentar' },
  { id: 'updated_at', label: 'Diperbarui', sort: 'updated_at' },
  { id: 'created_at', label: 'Dibuat', sort: 'created_at' },
];

export const DEFAULT_COLUMNS = ['code', 'title', 'status', 'priority', 'assignee', 'labels', 'due_date', 'comments', 'updated_at'];
export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

const KEY = 'mpo.view';

/** Buang id tak dikenal, pastikan kolom terkunci ada, urutkan sesuai definisi. */
export function sanitizeColumns(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [...DEFAULT_COLUMNS]; // data rusak/tidak ada -> bawaan
  const wanted = new Set(ids.filter((x): x is string => typeof x === 'string'));
  return COLUMN_DEFS.filter((c) => c.locked || wanted.has(c.id)).map((c) => c.id); // judul selalu ada
}

interface Stored {
  density: Density;
  columns: string[];
  pageSize: PageSize;
}

export function parseStored(raw: string | null): Stored {
  const fallback: Stored = { density: 'comfortable', columns: [...DEFAULT_COLUMNS], pageSize: 20 };
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as Partial<Stored>;
    return {
      density: v.density === 'compact' ? 'compact' : 'comfortable',
      columns: v.columns === undefined ? fallback.columns : sanitizeColumns(v.columns),
      pageSize: (PAGE_SIZES as readonly number[]).includes(v.pageSize as number) ? (v.pageSize as PageSize) : 20,
    };
  } catch {
    return fallback;
  }
}

function read(): Stored {
  try {
    return parseStored(localStorage.getItem(KEY));
  } catch {
    return parseStored(null);
  }
}

interface ViewState extends Stored {
  setDensity: (d: Density) => void;
  toggleColumn: (id: string) => void;
  resetColumns: () => void;
  setPageSize: (n: PageSize) => void;
}

function save(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ density: s.density, columns: s.columns, pageSize: s.pageSize }));
  } catch {
    /* penyimpanan bisa dinonaktifkan; preferensi tetap berlaku untuk sesi ini */
  }
}

export const useViewStore = create<ViewState>((set, get) => ({
  ...read(),
  setDensity: (density) => {
    set({ density });
    save({ ...get(), density });
  },
  toggleColumn: (id) => {
    const cur = get().columns;
    const next = sanitizeColumns(cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]);
    set({ columns: next });
    save({ ...get(), columns: next });
  },
  resetColumns: () => {
    const columns = [...DEFAULT_COLUMNS];
    set({ columns });
    save({ ...get(), columns });
  },
  setPageSize: (pageSize) => {
    set({ pageSize });
    save({ ...get(), pageSize });
  },
}));
