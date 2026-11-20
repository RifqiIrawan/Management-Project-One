import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.scss';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './store/themeStore';
import { useThemeStore } from './store/themeStore';

applyTheme(useThemeStore.getState().mode);

const root = document.getElementById('root');
if (!root) throw new Error('#root tidak ditemukan');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);