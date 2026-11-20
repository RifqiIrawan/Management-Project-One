import { NavLink } from 'react-router';

const ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'bi-house', end: true },
  { to: '/my-tasks', label: 'Tugas Saya', icon: 'bi-check2-square', end: false },
  { to: '/projects', label: 'Proyek', icon: 'bi-folder', end: false },
];

interface Props {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export default function Sidebar({ collapsed = false, onNavigate }: Props) {
  return (
    <nav className="d-flex flex-column h-100 p-3" aria-label={onNavigate ? 'Navigasi menu seluler' : 'Navigasi utama'}>
      <div className="d-flex align-items-center gap-2 mb-4 px-1">
        <span className="avatar bg-primary rounded-3" style={{ width: 32, height: 32 }} aria-hidden="true">
          <i className="bi bi-kanban" />
        </span>
        <span className="brand-text fw-bold fs-5">MPO</span>
      </div>
      <div className="d-grid gap-1">
        {ITEMS.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className="nav-item-link" onClick={onNavigate} title={collapsed ? i.label : undefined}>
            <i className={`bi ${i.icon} fs-5`} aria-hidden="true" />
            <span className="nav-label">{i.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}