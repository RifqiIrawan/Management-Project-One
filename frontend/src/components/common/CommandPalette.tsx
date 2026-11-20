import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router';
import { paletteTasksKey, searchMyTasks } from '@/api/me.api';
import { listProjects, qk } from '@/api/projects.api';
import { ensureWhiteText } from '@/utils/color';

interface Item {
  id: string;
  group: 'Halaman' | 'Proyek' | 'Tugas saya';
  label: string;
  hint?: string;
  icon: string;
  to: string;
  color?: string;
}

const PAGES: Item[] = [
  { id: 'p-dash', group: 'Halaman', label: 'Dashboard', icon: 'bi-grid-1x2', to: '/' },
  { id: 'p-mine', group: 'Halaman', label: 'Tugas Saya', icon: 'bi-check2-square', to: '/my-tasks' },
  { id: 'p-proj', group: 'Halaman', label: 'Proyek', icon: 'bi-kanban', to: '/projects' },
  { id: 'p-prof', group: 'Halaman', label: 'Profil', icon: 'bi-person-circle', to: '/profile' },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Pencarian cepat (Ctrl+K): halaman, proyek (dari cache), dan tugas saya (dari server). Navigasi penuh dengan keyboard. */
export default function CommandPalette({ show, onHide }: { show: boolean; onHide: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const q = text.trim();
  const dq = useDebounced(q, 250);
  const lower = q.toLowerCase();

  const projects = useQuery({ queryKey: qk.projects('', false), queryFn: () => listProjects('', false), enabled: show });
  const tasks = useQuery({ queryKey: paletteTasksKey(dq), queryFn: () => searchMyTasks(dq), enabled: show && dq.length >= 2 });

  const items = useMemo<Item[]>(() => {
    const pages = PAGES.filter((p) => !lower || p.label.toLowerCase().includes(lower));
    const projs: Item[] = (projects.data ?? [])
      .filter((p) => !lower || p.name.toLowerCase().includes(lower) || p.key.toLowerCase().includes(lower))
      .slice(0, 5)
      .map((p) => ({ id: `proj-${p.id}`, group: 'Proyek', label: p.name, hint: p.key, icon: 'bi-folder2', to: `/projects/${p.id}`, color: ensureWhiteText(p.color) }));
    // hasil tugas hanya dipakai bila sudah sesuai teks terakhir (hindari hasil basi saat mengetik cepat)
    const taskItems: Item[] = dq.length >= 2 && dq === q ? (tasks.data ?? []).map((t) => ({ id: `task-${t.id}`, group: 'Tugas saya', label: t.title, hint: `${t.code}${t.project ? ` · ${t.project.name}` : ''}`, icon: 'bi-check2-circle', to: `/projects/${t.project_id}/board?task=${t.id}` })) : [];
    return [...pages, ...projs, ...taskItems];
  }, [lower, projects.data, tasks.data, dq, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);
  useEffect(() => {
    document.getElementById(`cmd-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  function go(item: Item | undefined) {
    if (!item) return;
    onHide();
    navigate(item.to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(items.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[active]);
    }
  }

  const searching = show && dq.length >= 2 && tasks.isFetching;

  return (
    <Modal show={show} onHide={onHide} onExited={() => (setText(''), setActive(0))} dialogClassName="palette-dialog" contentClassName="palette" aria-label="Pencarian cepat" size="lg">
      <div className="palette-input">
        <i className="bi bi-search" aria-hidden="true" />
        <label htmlFor="cmd-input" className="visually-hidden">
          Cari halaman, proyek, atau tugas
        </label>
        <input
          id="cmd-input"
          autoFocus
          autoComplete="off"
          placeholder="Cari halaman, proyek, atau tugas..."
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={items.length > 0 ? `cmd-${active}` : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {searching && <span className="spinner-border spinner-border-sm text-secondary" role="status" aria-label="Mencari tugas" />}
        <kbd>Esc</kbd>
      </div>
      <ul id="cmd-list" role="listbox" aria-label="Hasil pencarian" className="palette-list">
        {items.map((it, i) => (
          <li key={it.id} role="presentation">
            {(i === 0 || items[i - 1]?.group !== it.group) && <div className="palette-group">{it.group}</div>}
            <div id={`cmd-${i}`} role="option" aria-selected={i === active} className={`palette-item${i === active ? ' is-active' : ''}`} onMouseMove={() => setActive(i)} onClick={() => go(it)}>
              {it.color ? <span className="project-dot" style={{ '--dot': it.color } as React.CSSProperties} aria-hidden="true" /> : <i className={`bi ${it.icon}`} aria-hidden="true" />}
              <span className="text-truncate">{it.label}</span>
              {it.hint && <span className="palette-hint">{it.hint}</span>}
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li role="presentation" className="palette-empty">
            {searching ? 'Mencari...' : `Tidak ada hasil untuk "${q}"`}
          </li>
        )}
      </ul>
      <div className="palette-foot" aria-hidden="true">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> memilih
        </span>
        <span>
          <kbd>Enter</kbd> membuka
        </span>
        <span>
          <kbd>Esc</kbd> menutup
        </span>
      </div>
    </Modal>
  );
}
