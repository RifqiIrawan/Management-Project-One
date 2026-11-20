import { useProjectContext } from './ProjectLayout';

export default function ProjectOverviewPage() {
  const { project } = useProjectContext();
  return (
    <div className="row g-3">
      <div className="col-12 col-lg-8">
        <div className="card">
          <div className="card-body">
            <h2 className="h6 text-secondary">Deskripsi</h2>
            <p className="mb-0">{project.description || <span className="text-secondary">Belum ada deskripsi.</span>}</p>
          </div>
        </div>
        <div className="alert alert-info mt-3 mb-0" role="note">
          Board Kanban dan tabel tugas hadir di tahap F3.
        </div>
      </div>
      <div className="col-12 col-lg-4">
        <div className="card">
          <div className="card-body">
            <h2 className="h6 text-secondary">Progress</h2>
            <div className="display-6 fw-bold">{project.progress}%</div>
            <div className="progress my-2" style={{ height: 8 }} role="progressbar" aria-label="Progress proyek" aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-bar" style={{ width: `${project.progress}%`, background: project.color }} />
            </div>
            <dl className="row small mb-0">
              <dt className="col-7 fw-normal text-secondary">Tugas selesai</dt>
              <dd className="col-5 text-end mb-1">
                {project.done_count}/{project.task_count}
              </dd>
              <dt className="col-7 fw-normal text-secondary">Anggota</dt>
              <dd className="col-5 text-end mb-1">{project.member_count}</dd>
              <dt className="col-7 fw-normal text-secondary">Peran Anda</dt>
              <dd className="col-5 text-end mb-0">{project.my_role === 'owner' ? 'Owner' : 'Member'}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
