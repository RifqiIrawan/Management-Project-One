import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { getDashboard, listMyTasks, myTasksKey } from '@/api/dashboard.api';
import { qk } from '@/api/projects.api';
import Avatar from '@/components/common/Avatar';
import AvatarStack from '@/components/common/AvatarStack';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { SkeletonDashboard, SkeletonRows } from '@/components/common/Skeleton';
import { PriorityBadge, StatusBadge, isOverdue, localToday } from '@/components/task/badges';
import type { DashboardStats, Task } from '@/types/api';
import { ensureWhiteText } from '@/utils/color';
import { parseError } from '@/utils/errors';
import { shortDate, timeAgo } from '@/utils/format';

type Tone = 'info' | 'success' | 'warn' | 'danger';
const TONE: Record<Tone, string> = { info: '#2F49B0', success: '#067647', warn: '#B54708', danger: '#B42318' };

function Stat({ label, value, note, tone }: { label: string; value: number; note: string; tone: Tone }) {
  return (
    <div className="stat-card" style={{ '--tone': TONE[tone] } as React.CSSProperties}>
      <p className="stat-label">{label}</p>
      <div className="d-flex align-items-baseline justify-content-between gap-2">
        <span className="stat-value">{value}</span>
        <span className="tint pill" style={{ '--c': TONE[tone] } as React.CSSProperties}>
          {note}
        </span>
      </div>
    </div>
  );
}

function statCards(s: DashboardStats): { label: string; value: number; note: string; tone: Tone }[] {
  const pct = s.total_tasks > 0 ? Math.round((s.completed_tasks / s.total_tasks) * 100) : 0;
  return [
    { label: 'Tugas aktif', value: s.open_tasks, note: `${s.in_progress} dikerjakan`, tone: 'info' },
    { label: 'Selesai', value: s.completed_tasks, note: `${pct}% dari total`, tone: 'success' },
    { label: 'Jatuh tempo minggu ini', value: s.due_this_week, note: s.due_this_week > 0 ? 'Pantau tenggat' : 'Longgar', tone: 'warn' },
    { label: 'Terlambat', value: s.overdue, note: s.overdue > 0 ? 'Perlu tindakan' : 'Aman', tone: s.overdue > 0 ? 'danger' : 'success' },
  ];
}

type Tab = 'semua' | 'aktif' | 'selesai';
const TABS: { id: Tab; label: string }[] = [
  { id: 'semua', label: 'Semua' },
  { id: 'aktif', label: 'Aktif' },
  { id: 'selesai', label: 'Selesai' },
];

function MyTasksPanel() {
  const [tab, setTab] = useState<Tab>('semua');
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: myTasksKey, queryFn: listMyTasks });
  const today = localToday();
  const rows = (data ?? []).filter((t: Task) => (tab === 'semua' ? true : tab === 'aktif' ? t.status !== 'done' : t.status === 'done'));

  return (
    <section className="panel" style={{ flex: '2 1 520px', minWidth: 0 }} aria-label="Tugas saya">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h2 className="panel-title">Tugas Saya</h2>
        <div className="segmented" role="group" aria-label="Filter tugas saya">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading && <SkeletonRows rows={4} label="Memuat tugas..." />}
      {isError && <ErrorState message={parseError(error).message} onRetry={() => void refetch()} />}
      {data && rows.length === 0 && <EmptyState icon="bi-check2-all" title="Tidak ada tugas" text={tab === 'selesai' ? 'Belum ada tugas yang selesai.' : 'Tugas yang di-assign ke Anda akan muncul di sini.'} />}
      {rows.length > 0 && (
        <div className="table-responsive border-0 p-0" style={{ background: 'transparent' }}>
          <table className="table align-middle" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th scope="col">Tugas</th>
                <th scope="col">Status</th>
                <th scope="col">Prioritas</th>
                <th scope="col">Tenggat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/projects/${t.project_id}/board?task=${t.id}`} className="row-link">
                      <span className="d-block fw-semibold">{t.title}</span>
                      <span className="small text-secondary">
                        {t.code}
                        {t.project ? ` · ${t.project.name}` : ''}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="text-nowrap fw-medium" style={{ color: isOverdue(t, today) ? '#B42318' : undefined }}>
                    {t.due_date ? shortDate(t.due_date) : <span className="text-secondary">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: qk.dashboard, queryFn: getDashboard });
  const today = localToday();

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="page-date">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p>
          <h1>Dashboard</h1>
        </div>
        <Link to="/projects" className="btn btn-primary">
          <i className="bi bi-plus-lg me-2" aria-hidden="true" />
          Proyek Baru
        </Link>
      </header>

      {isLoading && <SkeletonDashboard />}
      {isError && <ErrorState message={parseError(error).message} onRetry={() => void refetch()} />}

      {data && (
        <div className="d-flex flex-column gap-3">
          <div className="stat-grid" role="group" aria-label="Statistik tugas saya">
            {statCards(data.stats).map((s) => (
              <Stat key={s.label} {...s} />
            ))}
          </div>

          <div className="d-flex flex-wrap gap-3 align-items-stretch">
            <section className="panel" style={{ flex: '2 1 520px', minWidth: 0 }} aria-label="Progres proyek">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="panel-title">Progres Proyek</h2>
                <Link to="/projects" className="small fw-semibold">
                  Lihat semua
                </Link>
              </div>
              {data.recent_projects.length === 0 ? (
                <EmptyState icon="bi-kanban" title="Belum ada proyek" text="Buat proyek pertama untuk mulai mengatur tugas." />
              ) : (
                <ul className="list-unstyled d-flex flex-column gap-3 mb-0" aria-label="Daftar progres proyek">
                  {data.recent_projects.map((p) => (
                    <li key={p.id} className="project-row" style={{ '--pc': p.color } as React.CSSProperties}>
                      <div className="d-flex align-items-center gap-3 min-w-0" style={{ flex: '1 1 220px' }}>
                        <span className="tile" style={{ '--c': ensureWhiteText(p.color) } as React.CSSProperties} aria-hidden="true">
                          {p.icon || p.key.slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <Link to={`/projects/${p.id}`} className="d-block fw-semibold text-body text-truncate">
                            {p.name}
                          </Link>
                          <span className="small text-secondary">
                            {p.task_count} tugas · {p.member_count} anggota
                          </span>
                        </div>
                      </div>
                      <div className="d-flex align-items-center gap-3" style={{ flex: '2 1 200px' }}>
                        <div className="meter" role="progressbar" aria-label={`Progress ${p.name}`} aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
                          <span style={{ width: `${p.progress}%` }} />
                        </div>
                        <span className="fw-semibold text-end" style={{ width: 40 }}>
                          {p.progress}%
                        </span>
                      </div>
                      <AvatarStack members={(p.members_preview ?? []).slice(0, 3)} total={p.member_count} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" style={{ flex: '1 1 300px', minWidth: 0 }} aria-label="Tenggat terdekat">
              <h2 className="panel-title mb-3">Tenggat Terdekat</h2>
              {data.upcoming_tasks.length === 0 ? (
                <EmptyState icon="bi-calendar-check" title="Tidak ada tugas mendesak" text="Tugas dengan tenggat terdekat akan muncul di sini." />
              ) : (
                <ul className="list-unstyled d-flex flex-column gap-3 mb-0" aria-label="Tenggat terdekat">
                  {data.upcoming_tasks.slice(0, 4).map((t) => {
                    const late = isOverdue(t, today);
                    const parts = t.due_date ? shortDate(t.due_date).split(' ') : [];
                    return (
                      <li key={t.id} className="d-flex align-items-center gap-3">
                        <div className={`date-tile${late ? ' is-late' : ''}`}>
                          <div className="mon">{parts[1] ?? ''}</div>
                          <div className="day">{parts[0] ?? ''}</div>
                          {late && <span className="visually-hidden">Terlambat</span>}
                        </div>
                        <div className="min-w-0">
                          <Link to={`/projects/${t.project_id}/board?task=${t.id}`} className="d-block fw-semibold text-body text-truncate">
                            {t.title}
                          </Link>
                          <span className="small text-secondary">{t.project?.name ?? t.code}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="d-flex flex-wrap gap-3 align-items-stretch">
            <MyTasksPanel />

            <section className="panel" style={{ flex: '1 1 300px', minWidth: 0 }} aria-label="Aktivitas terbaru">
              <h2 className="panel-title mb-3">Aktivitas Terbaru</h2>
              {data.recent_activities.length === 0 ? (
                <EmptyState icon="bi-clock-history" title="Belum ada aktivitas" />
              ) : (
                <ul className="list-unstyled d-flex flex-column gap-3 mb-0" aria-label="Aktivitas terbaru">
                  {data.recent_activities.map((a) => (
                    <li key={a.id} className="d-flex gap-3">
                      <Avatar name={a.user.name} color={a.user.avatar_color} size={32} />
                      <div className="min-w-0" style={{ lineHeight: 1.45 }}>
                        <div>{a.message}</div>
                        <div className="small text-secondary">
                          {a.project?.name ? `${a.project.name} · ` : ''}
                          {timeAgo(a.created_at)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
