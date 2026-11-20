import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'mpo.theme';

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

/** Menerapkan tema ke <html data-bs-theme>. */
export function applyTheme(mode: ThemeMode): void {
  const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  document.documentElement.setAttribute('data-bs-theme', resolveTheme(mode, prefersDark));
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: read(),
  setMode: (mode) => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* penyimpanan bisa dinonaktifkan; tema tetap berlaku untuk sesi ini */
    }
    applyTheme(mode);
    set({ mode });
  },
}));