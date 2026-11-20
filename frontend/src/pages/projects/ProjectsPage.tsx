import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { listProjects, qk } from '@/api/projects.api';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Spinner from '@/components/common/Spinner';
import CreateProjectModal from '@/components/project/CreateProjectModal';
import ProjectCard from '@/components/project/ProjectCard';
import { useFavorite } from '@/hooks/useFavorite';
import { parseError } from '@/utils/errors';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const q = useDebounced(search.trim(), 300);
  const fav = useFavorite();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: qk.projects(q, archived), queryFn: () => listProjects(q, archived) });

  return (
    <section>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h3 fw-bold mb-0 me-auto">Proyek</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          Proyek baru
        </button>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4">
        <div className="flex-grow-1" style={{ maxWidth: 360 }}>
          <label htmlFor="project-search" className="visually-hidden">
            Cari proyek
          </label>
          <input id="project-search" type="search" className="form-control" placeholder="Cari proyek..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="segmented" role="group" aria-label="Tampilan proyek">
          <button type="button" aria-pressed={!archived} onClick={() => setArchived(false)}>
            Aktif
          </button>
          <button type="button" aria-pressed={archived} onClick={() => setArchived(true)}>
            Arsip
          </button>
        </div>
      </div>

      {isLoading && <Spinner label="Memuat proyek..." />}
      {isError && <ErrorState message={parseError(error).message} onRetry={() => void refetch()} />}
      {data && data.length === 0 && (
        <EmptyState
          icon={archived ? 'bi-archive' : 'bi-folder2-open'}
          title={q ? 'Tidak ada proyek yang cocok' : archived ? 'Belum ada proyek terarsip' : 'Belum ada proyek'}
          text={q ? `Tidak ada proyek dengan nama "${q}".` : archived ? undefined : 'Buat proyek pertama Anda untuk mulai mengatur tugas.'}
          action={
            !q && !archived ? (
              <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
                Buat proyek
              </button>
            ) : undefined
          }
        />
      )}
      {data && data.length > 0 && (
        <ul className="project-grid list-unstyled" aria-label="Daftar proyek">
          {data.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} onToggleFavorite={(x) => fav.mutate(x.id)} />
            </li>
          ))}
        </ul>
      )}

      <CreateProjectModal show={showCreate} onHide={() => setShowCreate(false)} />
    </section>
  );
}
