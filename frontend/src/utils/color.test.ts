import { describe, expect, it } from 'vitest';
import { PROJECT_COLORS } from '@/schemas/project.schema';
import { STATUS_CONFIG } from '@/utils/constants';
import { COLUMN_DEFS, DEFAULT_COLUMNS, parseStored, sanitizeColumns } from '@/store/viewStore';
import { contrastRatio, ensureWhiteText, hexToRgb } from './color';

describe('ensureWhiteText: header selalu bertulisan putih', () => {
  it('warna yang sudah cukup gelap tidak diubah (hanya dinormalkan ke huruf besar)', () => {
    expect(ensureWhiteText('#3B5BDB')).toBe('#3B5BDB');
    expect(ensureWhiteText('#6366f1')).toBe('#6366F1');
    expect(ensureWhiteText('#1D2939')).toBe('#1D2939');
  });
  it('warna terang digelapkan sampai kontras dengan putih minimal 3:1, dan tetap sewarna (bukan abu/hitam)', () => {
    for (const light of ['#F59F00', '#FFE066', '#12B76A', '#15AABF', '#A8E6CF']) {
      const out = ensureWhiteText(light);
      expect(out, light).not.toBe(light.toUpperCase());
      expect(contrastRatio(out, '#FFFFFF'), light).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(out, '#FFFFFF'), `${light} tidak digelapkan berlebihan`).toBeLessThan(4.2);
    }
  });
  it('mendukung #rgb; warna tidak valid dikembalikan apa adanya tanpa error', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(ensureWhiteText('bukan-warna')).toBe('bukan-warna');
    expect(hexToRgb('#12')).toBeNull();
    expect(contrastRatio(ensureWhiteText('#FFFFFF'), '#FFFFFF')).toBeGreaterThanOrEqual(3); // putih pun jadi gelap, tidak menghasilkan teks tak terbaca
  });
  it('SEMUA warna pilihan proyek dan kolom status lulus kontras 3:1 dengan teks putih tanpa perlu diubah', () => {
    const fills = [...PROJECT_COLORS, ...Object.values(STATUS_CONFIG).map((s) => s.fill)];
    for (const bg of fills) {
      expect(contrastRatio(bg, '#FFFFFF'), bg).toBeGreaterThanOrEqual(3);
      expect(ensureWhiteText(bg), `${bg} sudah cukup gelap`).toBe(bg.toUpperCase());
    }
  });
});

describe('viewStore: kolom tabel', () => {
  it('kolom terkunci (judul) selalu ada; id tak dikenal dibuang; urutan mengikuti definisi', () => {
    expect(sanitizeColumns(['due_date', 'zzz', 'code'])).toEqual(['code', 'title', 'due_date']);
    expect(sanitizeColumns([])).toEqual(['title']);
    expect(sanitizeColumns(undefined)).toEqual(DEFAULT_COLUMNS);
    expect(sanitizeColumns('bukan array')).toEqual(DEFAULT_COLUMNS);
  });
  it('semua kolom default dikenal, dan kolom sort hanya yang ada di daftar putih backend', () => {
    const ids = COLUMN_DEFS.map((c) => c.id);
    for (const c of DEFAULT_COLUMNS) expect(ids).toContain(c);
    const allowed = ['created_at', 'updated_at', 'due_date', 'start_date', 'title', 'priority', 'status', 'code'];
    for (const c of COLUMN_DEFS) if (c.sort) expect(allowed).toContain(c.sort);
  });
  it('data tersimpan rusak/tidak valid kembali ke bawaan; nilai valid dipakai', () => {
    expect(parseStored(null)).toEqual({ density: 'comfortable', columns: DEFAULT_COLUMNS, pageSize: 20 });
    expect(parseStored('{rusak')).toEqual({ density: 'comfortable', columns: DEFAULT_COLUMNS, pageSize: 20 });
    expect(parseStored(JSON.stringify({ density: 'compact', columns: ['code'], pageSize: 100 }))).toEqual({ density: 'compact', columns: ['code', 'title'], pageSize: 100 });
    expect(parseStored(JSON.stringify({ density: 'aneh', pageSize: 7 }))).toMatchObject({ density: 'comfortable', pageSize: 20 });
  });
});
