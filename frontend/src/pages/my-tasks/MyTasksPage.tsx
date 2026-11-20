import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import { listMyTasksGrouped, myGroupedKey } from '@/api/me.api';
import { qk } from '@/api/projects.api';
import { updateTask } from '@/api/tasks.api';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { SkeletonRows } from '@/components/common/Skeleton';
import { PriorityBadge } from '@/components/task/badges';
import type { MyTasksGrouped, Task } from '@/types/api';
import { ensureWhiteText } from '@/utils/color';
import { PRIORITIES, PRIORITY_CONFIG } from '@/utils/constants';
import { parseError } from '@/utils/errors';
import { shortDate } from '@/utils/format';

type GroupKey = keyof MyTasksGrouped;

const GROUPS: { key: GroupKey; label: string; color: string; icon: string }[] = [
  { key: 'overdue', label: 'Terlambat', color: '#B42318', icon: 'bi-exclamation-circle' },
  { key: 'today', label: 'Hari ini', color: '#2F49B0', icon: 'bi-brightness-high' },
  { key: 'this_week', label: 'Minggu ini', color: '#B54708', icon: 'bi-calendar-week' },
  { key: 'later', label: 'Nanti', color: '#475467', icon: 'bi-calendar2' },
  { key: 'no_deadline', label: 'Tanpa deadline', color: '#667085', icon: 'bi-infinity' },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function TaskRow({ task, onToggle, busy }: { task: Task; onToggle: (t: Task) => void; busy: boolean }) {
  const done = task.status === 'done';
  return (
    <li className={`my-task${done ? ' is-done' : ''}`}>
      <input className="form-check-input my-task-check" type="checkbox" checked={done} disabled={busy} aria-label={`${done ? 'Batalkan selesai' : 'Tandai selesai'}: ${task.title}`} onChange={() => onToggle(task)} />
      <div className="min-w-0 flex-grow-1">
        <Link to={`/projects/${task.project_id}/board?task=${task.id}`} className="my-task-title text-body">
          {task.title}
        </Link>
        <div className="small text-secondary d-flex flex-wrap align-items-center gap-2">
          {task.project && (
            <span className="d-inline-flex align-items-center gap-1">
              <span className="project-dot" style={{ '--dot': ensureWhiteText(task.project.color) } as React.CSSProperties} aria-hidden="true" />
              {task.project.name}
            </span>
          )}
          <span>{task.code}</span>
          {task.due_date && (
            <span className="d-inline-flex align-items-center gap-1">
              <i className="bi bi-clock" aria-hidden="true" />
              {shortDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
      <PriorityBadge priority={task.priority} />
    </li>
  );
}

export default function MyTasksPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [showDone, setShowDone] = useState(false);
  const q = useDebounced(search.trim(), 300);
  const params = useMemo(() => ({ ...(q ? { q } : {}), ...(priority ? { priority } : {}), ...(showDone ? { include_done: true } : {}) }), [q, priority, showDone]);

  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: myGroupedKey(params), queryFn: () => listMyTasksGrouped(params) });

  const toggle = useMutation({
    mutationFn: (t: Task) => updateTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' }),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: qk.dashboard }); // juga menyegarkan jumlah di sidebar
      void qc.invalidateQueries({ queryKey: ['project', t.project_id] });
      toast.success(t.status === 'done' ? `${t.code} selesai` : `${t.code} dibuka kembali`);
    },
    onError: (e) => toast.error(parseError(e).message),
  });

  const total = data ? GROUPS.reduce((n, g) => n + data[g.key].length, 0) : 0;
  const filtered = !!(q || priority);

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="page-date">Ditugaskan kepada saya</p>
          <h1>Tugas Saya</h1>
        </div>
        {data && (
          <div className="d-flex gap-2" aria-label="Ringkasan tugas saya" role="group">
            <span className="tint pill" style={{ '--c': '#B42318' } as React.CSSProperties}>
              {data.overdue.length} terlambat
            </span>
            <span className="tint pill" style={{ '--c': '#2F49B0' } as React.CSSProperties}>
              {data.today.length} hari ini
            </span>
            <span className="tint pill">{total} total</span>
          </div>
        )}
      </header>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3" role="search" aria-label="Filter tugas saya">
        <div style={{ width: 260, maxWidth: '100%' }}>
          <label htmlFor="mine-search" className="visually-hidden">
            Cari tugas saya
          </label>
          <input id="mine-search" type="search" className="form-control form-control-sm" placeholder="Cari judul atau kode..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label htmlFor="mine-priority" className="visually-hidden">
          Prioritas
        </label>
        <select id="mine-priority" className="form-select form-select-sm w-auto" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Semua prioritas</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_CONFIG[p].label}
            </option>
          ))}
        </select>
        <div className="form-check form-switch ms-md-auto mb-0">
          <input className="form-check-input" type="checkbox" role="switch" id="mine-done" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          <label className="form-check-label" htmlFor="mine-done">
            Tampilkan yang selesai
          </label>
        </div>
      </div>

      {isLoading && <SkeletonRows rows={7} label="Memuat tugas saya..." />}
      {isError && <ErrorState message={parseError(error).message} onRetry={() => void refetch()} />}

      {data && total === 0 && (
        <div className="panel">
          <EmptyState
            icon={filtered ? 'bi-funnel' : 'bi-check2-all'}
            title={filtered ? 'Tidak ada tugas yang cocok' : 'Tidak ada tugas untuk Anda'}
            text={filtered ? 'Ubah atau hapus filter untuk melihat tugas lain.' : 'Tugas yang di-assign ke Anda dari proyek mana pun akan muncul di sini.'}
            action={
              !filtered ? (
                <Link to="/projects" className="btn btn-primary">
                  Lihat proyek
                </Link>
              ) : undefined
            }
          />
        </div>
      )}

      {data && total > 0 && (
        <div className="d-grid gap-3">
          {GROUPS.filter((g) => data[g.key].length > 0).map((g) => (
            <section key={g.key} className="panel p-0 overflow-hidden" aria-label={g.label}>
              <h2 className="my-group-head" style={{ '--c': g.color } as React.CSSProperties}>
                <i className={`bi ${g.icon}`} aria-hidden="true" />
                {g.label}
                <span className="tint pill ms-1">{data[g.key].length}</span>
              </h2>
              <ul className="list-unstyled mb-0" aria-label={`Tugas ${g.label}`}>
                {data[g.key].map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={(x) => toggle.mutate(x)} busy={toggle.isPending && toggle.variables?.id === t.id} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
