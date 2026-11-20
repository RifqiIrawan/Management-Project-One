import { Link, useLocation } from 'react-router';

const LABELS: Record<string, string> = {
  'my-tasks': 'Tugas Saya',
  projects: 'Proyek',
  profile: 'Profil',
  board: 'Board',
  list: 'List',
  settings: 'Pengaturan',
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  let acc = '';
  const crumbs = parts.map((p) => {
    acc += `/${p}`;
    return { to: acc, label: LABELS[p] ?? p };
  });
  return (
    <nav aria-label="Breadcrumb">
      <ol className="breadcrumb mb-0 small">
        <li className="breadcrumb-item">
          <Link to="/">Dashboard</Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.to} className={`breadcrumb-item${i === crumbs.length - 1 ? ' active' : ''}`} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
            {i === crumbs.length - 1 ? c.label : <Link to={c.to}>{c.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}