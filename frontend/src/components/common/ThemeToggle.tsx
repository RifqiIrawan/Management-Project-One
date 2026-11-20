import { useThemeStore, type ThemeMode } from '@/store/themeStore';

const NEXT: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };
const ICON: Record<ThemeMode, string> = { light: 'bi-sun', dark: 'bi-moon-stars', system: 'bi-circle-half' };
const LABEL: Record<ThemeMode, string> = { light: 'Tema terang', dark: 'Tema gelap', system: 'Ikuti sistem' };

export default function ThemeToggle() {
  const { mode, setMode } = useThemeStore();
  return (
    <button
      type="button"
      className="btn btn-outline-secondary border-0"
      aria-label={`${LABEL[mode]} (klik untuk mengganti)`}
      title={LABEL[mode]}
      onClick={() => setMode(NEXT[mode])}
    >
      <i className={`bi ${ICON[mode]}`} aria-hidden="true" />
    </button>
  );
}