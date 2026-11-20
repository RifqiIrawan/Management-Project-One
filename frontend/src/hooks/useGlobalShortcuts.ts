import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

/** Tujuan untuk urutan "g" lalu huruf (gaya GitHub/Linear). */
export const GO_TARGETS: Record<string, string> = { d: '/', t: '/my-tasks', p: '/projects', u: '/profile' };
const SEQUENCE_MS = 1000;

export const SHORTCUTS: { keys: string[]; label: string; sequence?: boolean }[] = [
  { keys: ['Ctrl', 'K'], label: 'Buka pencarian cepat (di Mac: ⌘ K)' },
  { keys: ['/'], label: 'Buka pencarian cepat' },
  { keys: ['?'], label: 'Tampilkan daftar pintasan ini' },
  { keys: ['g', 'd'], label: 'Ke Dashboard', sequence: true },
  { keys: ['g', 't'], label: 'Ke Tugas Saya', sequence: true },
  { keys: ['g', 'p'], label: 'Ke Proyek', sequence: true },
  { keys: ['g', 'u'], label: 'Ke Profil', sequence: true },
  { keys: ['Esc'], label: 'Tutup dialog atau panel' },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

interface Handlers {
  onPalette: () => void;
  onHelp: () => void;
}

/**
 * Pintasan keyboard global. Ctrl/⌘+K selalu aktif (juga saat mengetik); pintasan huruf diabaikan saat
 * mengetik di kolom isian atau saat dialog/panel terbuka agar tidak mengganggu.
 */
export function useGlobalShortcuts({ onPalette, onHelp }: Handlers): void {
  const navigate = useNavigate();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onPalette();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (document.querySelector('.modal.show, .offcanvas.show')) return;

      if (pendingG.current !== null && Date.now() - pendingG.current < SEQUENCE_MS) {
        pendingG.current = null;
        const to = GO_TARGETS[e.key.toLowerCase()];
        if (to) {
          e.preventDefault();
          navigate(to);
        }
        return;
      }
      pendingG.current = null;
      if (e.key === '/') {
        e.preventDefault();
        onPalette();
      } else if (e.key === '?') {
        e.preventDefault();
        onHelp();
      } else if (e.key === 'g') {
        pendingG.current = Date.now();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, onPalette, onHelp]);
}
