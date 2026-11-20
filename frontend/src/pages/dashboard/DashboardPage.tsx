import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getDashboard } from '@/api/dashboard.api';
import { qk } from '@/api/projects.api';
import Avatar from '@/components/common/Avatar';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Spinner from '@/components/common/Spinner';
import ProjectCard from '@/components/project/ProjectCard';
import { useAuthStore } from '@/store/authStore';
import { PRIORITY_CONFIG, STATUS_CONFIG } from '@/utils/constants';
import { parseError } from '@/utils/errors';
import { shortDate, timeAgo } from '@/utils/format';

/** Sapaan menurut jam lokal browser. */
export function greeting(hour: number): string {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: string }) {
  return (
    <div className="col-6 col-lg-4 col-xl-2">
      <div className="card h-100">
        <div className="card-body d-flex align-items-center gap-3">
          <span className={`stat-icon text-${tone}`} aria-hidden="true">
            <i className={`bi ${icon}`} />
          </span>
          <div>
            <div className="h4 fw-bold mb-0">{value}</div>
            <div className="small text-secondary">{label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: qk.dashboard, queryFn: getDashboard });

  return (
    <section>
      <h1 className="h3 fw-bold">
        {greeting(new Date().getHours())}, {user?.name ?? ''} 👋
      </h1>

      {isLoading && <Spinner label="Memuat dashboard..." />}
      {isError && <ErrorState message={parseError(error).message} onRetry={() => void refetch()} />}

      {data && (
        <>
          <div className="row g-3 my-1" aria-label="Statistik tugas saya" role="group">
            <Stat label="Total tugas" value={data.stats.total_tasks} icon="bi-list-task" tone="primary" />
            <Stat label="Belum selesai" value={data.stats.open_tasks} icon="bi-hourglass-split" tone="secondary" />
            <Stat label="Dikerjakan" value={data.stats.in_progress} icon="bi-circle-half" tone="info" />
            <Stat label="Selesai" value={data.stats.completed_tasks} icon="bi-check-circle" tone="success" />
            <Stat label="Minggu ini" value={data.stats.due_this_week} icon="bi-calendar-week" tone="warning" />
            <Stat label="Terlambat" value={data.stats.overdue} icon="bi-exclamation-octagon" tone="danger" />
          </div>

          <div className="row g-4 mt-1">
            <div className="col-12 col-xl-7">
              <h2 className="h5">Tugas jatuh tempo</h2>
              {data.upcoming_tasks.length === 0 ? (
                <div className="card">
                  <EmptyState icon="bi-check2-all" title="Tidak ada tugas mendesak" text="Tugas dengan tenggat terdekat akan muncul di sini." />
                </div>
              ) : (
                <ul className="list-group" aria-label="Tugas jatuh tempo">
                  {data.upcoming_tasks.map((t) => (
                    <li key={t.id} className="list-group-item d-flex align-items-center gap-3">
                      <i className={`bi ${STATUS_CONFIG[t.status].icon}`} style={{ color: STATUS_CONFIG[t.status].color }} title={STATUS_CONFIG[t.status].label} aria-label={STATUS_CONFIG[t.status].label} />
                      <div className="flex-grow-1 min-w-0">
                        <div className="text-truncate">
                          <span className="text-secondary small me-2">{t.code}</span>
                          {t.title}
                        </div>
                        {t.project && (
                          <Link to={`/projects/${t.project.id}`} className="small text-decoration-none">
                            {t.project.name}
                          </Link>
                        )}
                      </div>
                      <span className="badge" style={{ background: PRIORITY_CONFIG[t.priority].color }}>
                        {PRIORITY_CONFIG[t.priority].label}
                      </span>
                      {t.due_date && <span className={`small ${t.is_overdue ? 'text-danger fw-semibold' : 'text-secondary'}`}>{t.is_overdue ? 'Terlambat · ' : ''}{shortDate(t.due_date)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="col-12 col-xl-5">
              <h2 className="h5">Aktivitas terbaru</h2>
              {data.recent_activities.length === 0 ? (
                <div className="card">
                  <EmptyState icon="bi-clock-history" title="Belum ada aktivitas" />
                </div>
              ) : (
                <ul className="list-group" aria-label="Aktivitas terbaru">
                  {data.recent_activities.map((a) => (
                    <li key={a.id} className="list-group-item d-flex gap-2">
                      <Avatar name={a.user.name} color={a.user.avatar_color} size={28} />
                      <div className="min-w-0">
                        <div className="small">{a.message}</div>
                        <div className="small text-secondary">
                          {a.project?.name ? `${a.project.name} · ` : ''}
                          {timeAgo(a.created_at)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="d-flex align-items-center mt-4 mb-2">
            <h2 className="h5 mb-0 me-auto">Proyek terbaru</h2>
            <Link to="/projects" className="small">
              Lihat semua
            </Link>
          </div>
          {data.recent_projects.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="bi-folder2-open"
                title="Belum ada proyek"
                text="Buat proyek pertama untuk mulai mengatur tugas."
                action={
                  <Link to="/projects" className="btn btn-primary">
                    Ke daftar proyek
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="row g-3 list-unstyled" aria-label="Proyek terbaru">
              {data.recent_projects.map((p) => (
                <li key={p.id} className="col-12 col-md-6 col-xl-4">
                  <ProjectCard project={p} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
