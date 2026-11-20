import { Link } from 'react-router';
import AvatarStack from '@/components/common/AvatarStack';
import type { Project } from '@/types/api';

interface Props {
  project: Project;
  onToggleFavorite?: (p: Project) => void;
}

export default function ProjectCard({ project: p, onToggleFavorite }: Props) {
  return (
    <div className="card h-100 project-card" style={{ borderTop: `4px solid ${p.color}` }}>
      <div className="card-body d-flex flex-column gap-2">
        <div className="d-flex align-items-start gap-2">
          <span className="fs-4" aria-hidden="true">
            {p.icon || '📁'}
          </span>
          <div className="flex-grow-1 min-w-0">
            <h3 className="h6 mb-0 text-truncate">
              <Link to={`/projects/${p.id}`} className="stretched-link text-body text-decoration-none">
                {p.name}
              </Link>
            </h3>
            <span className="small text-secondary">{p.key}</span>
            {p.archived_at && <span className="badge text-bg-secondary ms-2">Diarsipkan</span>}
          </div>
          {onToggleFavorite && (
            <button
              type="button"
              className="btn btn-link p-0 position-relative text-warning"
              style={{ zIndex: 2 }}
              aria-pressed={p.is_favorite}
              aria-label={p.is_favorite ? `Hapus ${p.name} dari favorit` : `Jadikan ${p.name} favorit`}
              onClick={() => onToggleFavorite(p)}
            >
              <i className={`bi ${p.is_favorite ? 'bi-star-fill' : 'bi-star'}`} aria-hidden="true" />
            </button>
          )}
        </div>
        {p.description && <p className="small text-secondary mb-0 line-clamp-2">{p.description}</p>}
        <div className="mt-auto pt-2">
          <div className="d-flex justify-content-between small text-secondary mb-1">
            <span>
              {p.done_count}/{p.task_count} tugas
            </span>
            <span>{p.progress}%</span>
          </div>
          <div className="progress" style={{ height: 6 }} role="progressbar" aria-label={`Progress ${p.name}`} aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-bar" style={{ width: `${p.progress}%`, background: p.color }} />
          </div>
          <div className="mt-2">
            <AvatarStack members={p.members_preview ?? []} total={p.member_count} />
          </div>
        </div>
      </div>
    </div>
  );
}
