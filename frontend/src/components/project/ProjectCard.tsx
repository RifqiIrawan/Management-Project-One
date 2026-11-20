import { Link } from 'react-router';
import AvatarStack from '@/components/common/AvatarStack';
import type { Project } from '@/types/api';
import { ensureWhiteText } from '@/utils/color';

interface Props {
  project: Project;
  onToggleFavorite?: (p: Project) => void;
}

export default function ProjectCard({ project: p, onToggleFavorite }: Props) {
  return (
    <div className="card h-100 project-card" style={{ '--pc': ensureWhiteText(p.color) } as React.CSSProperties}>
      <div className="project-card-head">
        <span className="project-card-mark" aria-hidden="true">
          {p.icon || p.key.slice(0, 2)}
        </span>
        <span className="project-card-key">{p.key}</span>
        {p.archived_at && <span className="badge text-bg-secondary ms-1">Diarsipkan</span>}
        {onToggleFavorite && (
          <button
            type="button"
            className="project-card-star"
            aria-pressed={p.is_favorite}
            aria-label={p.is_favorite ? `Hapus ${p.name} dari favorit` : `Jadikan ${p.name} favorit`}
            onClick={() => onToggleFavorite(p)}
          >
            <i className={`bi ${p.is_favorite ? 'bi-star-fill' : 'bi-star'}`} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="card-body d-flex flex-column gap-2 p-3">
        <h3 className="fs-6 fw-semibold mb-0 text-truncate">
          <Link to={`/projects/${p.id}`} className="stretched-link text-body text-decoration-none">
            {p.name}
          </Link>
        </h3>
        {p.description && <p className="small text-secondary mb-0 text-truncate">{p.description}</p>}
        <div className="mt-auto pt-2">
          <div className="d-flex justify-content-between small text-secondary mb-1">
            <span>
              {p.done_count}/{p.task_count} tugas
            </span>
            <span className="fw-semibold">{p.progress}%</span>
          </div>
          <div className="progress" role="progressbar" aria-label={`Progress ${p.name}`} aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-bar" style={{ width: `${p.progress}%` }} />
          </div>
          <div className="mt-2">
            <AvatarStack members={p.members_preview ?? []} total={p.member_count} />
          </div>
        </div>
      </div>
    </div>
  );
}
