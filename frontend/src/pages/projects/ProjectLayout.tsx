import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { getProject, qk } from '@/api/projects.api';
import ErrorState from '@/components/common/ErrorState';
import Spinner from '@/components/common/Spinner';
import { useFavorite } from '@/hooks/useFavorite';
import type { Project } from '@/types/api';
import { parseError } from '@/utils/errors';
import NotFoundPage from '../NotFoundPage';

export interface ProjectContext {
  project: Project;
  isOwner: boolean;
}

export function useProjectContext(): ProjectContext {
  return useOutletContext<ProjectContext>();
}

export default function ProjectLayout() {
  const { projectId = '' } = useParams();
  const fav = useFavorite();
  const { data: project, isLoading, isError, error, refetch } = useQuery({ queryKey: qk.project(projectId), queryFn: () => getProject(projectId) });

  if (isLoading) return <Spinner label="Memuat proyek..." />;
  if (isError) {
    const err = parseError(error);
    // non-anggota dan ID tidak dikenal sama-sama 404: tampilkan halaman tidak ditemukan
    if (err.code === 'NOT_FOUND') return <NotFoundPage />;
    return <ErrorState message={err.message} onRetry={() => void refetch()} />;
  }
  if (!project) return null;

  const isOwner = project.my_role === 'owner';
  const tab = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`;

  return (
    <section>
      <header className="d-flex align-items-center gap-3 mb-3">
        <span className="fs-2" aria-hidden="true">
          {project.icon || '📁'}
        </span>
        <div className="flex-grow-1 min-w-0">
          <h1 className="h3 fw-bold mb-0 text-truncate">{project.name}</h1>
          <span className="small text-secondary">{project.key}</span>
          {project.archived_at && <span className="badge text-bg-secondary ms-2">Diarsipkan</span>}
        </div>
        <button
          type="button"
          className="btn btn-outline-warning"
          aria-pressed={project.is_favorite}
          aria-label={project.is_favorite ? 'Hapus dari favorit' : 'Jadikan favorit'}
          onClick={() => fav.mutate(project.id)}
        >
          <i className={`bi ${project.is_favorite ? 'bi-star-fill' : 'bi-star'}`} aria-hidden="true" />
        </button>
      </header>

      <ul className="nav nav-tabs mb-4" aria-label="Bagian proyek">
        <li className="nav-item">
          <NavLink to={`/projects/${project.id}/board`} className={tab}>
            Board
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to={`/projects/${project.id}/list`} className={tab}>
            Tabel
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to={`/projects/${project.id}/overview`} className={tab}>
            Ringkasan
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to={`/projects/${project.id}/members`} className={tab}>
            Anggota
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to={`/projects/${project.id}/settings`} className={tab}>
            Pengaturan
          </NavLink>
        </li>
      </ul>

      <Outlet context={{ project, isOwner } satisfies ProjectContext} />
    </section>
  );
}
