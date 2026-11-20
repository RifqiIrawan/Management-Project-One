/** Warna kuat per proyek: header selalu bertulisan putih (konsisten), latar disesuaikan agar tetap terbaca. */

export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminans relatif WCAG 2.x. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#FFFFFF';
export const MIN_WHITE_CONTRAST = 3; // WCAG AA untuk teks tebal/besar (judul header)

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Warna latar untuk header dengan TEKS PUTIH. Warna yang terlalu terang untuk teks putih digelapkan
 * secukupnya (dicampur hitam) sampai kontrasnya minimal MIN_WHITE_CONTRAST; warna yang sudah cukup gelap tidak diubah.
 * Warna tidak valid dikembalikan apa adanya.
 */
export function ensureWhiteText(hex: string, min = MIN_WHITE_CONTRAST): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let out = toHex(rgb);
  if (contrastRatio(out, WHITE) >= min) return out;
  for (let t = 0.04; t <= 1; t += 0.04) {
    out = toHex(rgb.map((v) => v * (1 - t)) as [number, number, number]);
    if (contrastRatio(out, WHITE) >= min) return out;
  }
  return '#000000';
}
