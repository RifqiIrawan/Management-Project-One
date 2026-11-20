import { useQuery } from '@tanstack/react-query';
import { Link, NavLink } from 'react-router';
import { getDashboard } from '@/api/dashboard.api';
import { listProjects, qk } from '@/api/projects.api';
import Avatar from '@/components/common/Avatar';
import { useAuthStore } from '@/store/authStore';

const ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'bi-grid-1x2', end: true },
  { to: '/my-tasks', label: 'Tugas Saya', icon: 'bi-check2-square', end: false, count: true },
  { to: '/projects', label: 'Proyek', icon: 'bi-kanban', end: true },
];

const MAX_PROJECTS = 6;

interface Props {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export default function Sidebar({ collapsed = false, onNavigate }: Props) {
  const user = useAuthStore((s) => s.user);
  // memakai cache yang sama dengan Dashboard dan daftar proyek (tidak menambah request bila sudah dimuat)
  const dash = useQuery({ queryKey: qk.dashboard, queryFn: getDashboard });
  const projects = useQuery({ queryKey: qk.projects('', false), queryFn: () => listProjects('', false) });
  const open = dash.data?.stats.open_tasks;
  const list = projects.data ?? [];

  return (
    <nav className="sidebar-nav" aria-label={onNavigate ? 'Navigasi menu seluler' : 'Navigasi utama'}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          MPO
        </span>
        <span className="brand-title">
          <span className="brand-text">Project One</span>
          <span className="brand-sub">Management Project One</span>
        </span>
      </div>

      <div className="nav-group">
        {ITEMS.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className="nav-item-link" onClick={onNavigate} title={collapsed ? i.label : undefined}>
            <i className={`bi ${i.icon}`} aria-hidden="true" />
            <span className="nav-label">{i.label}</span>
            {i.count && open !== undefined && <span className="nav-count">{open}</span>}
          </NavLink>
        ))}
      </div>

      <div className="sidebar-projects">
        <div className="nav-section">
          <span>Proyek</span>
          <Link to="/projects" aria-label="Kelola proyek" onClick={onNavigate}>
            <i className="bi bi-plus-lg" aria-hidden="true" />
          </Link>
        </div>
        <div className="nav-group">
          {list.slice(0, MAX_PROJECTS).map((p) => (
            <NavLink key={p.id} to={`/projects/${p.id}`} className="project-link" onClick={onNavigate} style={{ '--dot': p.color } as React.CSSProperties}>
              <span className="project-dot" style={{ '--dot': p.color } as React.CSSProperties} aria-hidden="true" />
              <span>{p.name}</span>
            </NavLink>
          ))}
          {list.length > MAX_PROJECTS && (
            <Link to="/projects" className="project-link" onClick={onNavigate} style={{ color: 'var(--mpo-sidebar-muted)' }}>
              <span className="project-dot" style={{ '--dot': 'transparent' } as React.CSSProperties} aria-hidden="true" />
              <span>Lihat semua ({list.length})</span>
            </Link>
          )}
        </div>
      </div>

      {user && (
        <div className="sidebar-user">
          <Avatar name={user.name} color={user.avatar_color} size={36} />
          <div className="sidebar-user-text min-w-0">
            <div className="fw-semibold text-truncate">{user.name}</div>
            <div className="small text-truncate" style={{ color: 'var(--mpo-sidebar-muted)' }}>
              {user.email}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
