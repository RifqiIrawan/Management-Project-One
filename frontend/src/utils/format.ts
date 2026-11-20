/** Inisial untuk avatar: huruf pertama dari maksimal dua kata pertama. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  const second = parts[1] ?? '';
  return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase() || '?';
}
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
dayjs.locale('id');

/** "5 menit yang lalu". Nilai tak valid -> string kosong. */
export function timeAgo(iso: string): string {
  const d = dayjs(iso);
  return d.isValid() ? d.fromNow() : '';
}

/** Tanggal "YYYY-MM-DD" dari backend ditampilkan "20 Nov". Tanpa konversi zona waktu. */
export function shortDate(date: string): string {
  const d = dayjs(date);
  return d.isValid() ? d.format('D MMM') : '';
}
