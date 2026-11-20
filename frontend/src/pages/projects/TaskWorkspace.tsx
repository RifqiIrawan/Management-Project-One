import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { listMembers, qk } from '@/api/projects.api';
import { getBoard, listTasks, tk } from '@/api/tasks.api';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Spinner from '@/components/common/Spinner';
import CreateTaskModal from '@/components/task/CreateTaskModal';
import KanbanBoard from '@/components/task/KanbanBoard';
import TaskDetailPanel from '@/components/task/TaskDetailPanel';
import TaskFilters from '@/components/task/TaskFilters';
import TaskTable from '@/components/task/TaskTable';
import type { Task, TaskStatus } from '@/types/api';
import { parseError } from '@/utils/errors';
import { filtersFromSearch, filtersToParams, hasActiveFilters, type TaskFilters as Filters } from '@/utils/taskLogic';
import { useProjectContext } from './ProjectLayout';

const PER_PAGE = 20;
const FILTER_KEYS = ['q', 'status', 'priority', 'assignee', 'due'] as const;

export default function TaskWorkspace({ view }: { view: 'board' | 'list' }) {
  const { project, isOwner } = useProjectContext();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(sp), [sp]);
  const taskId = sp.get('task');
  const readOnly = !!project.archived_at;
  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const members = useQuery({ queryKey: qk.members(project.id), queryFn: () => listMembers(project.id) });

  const setFilters = useCallback(
    (patch: Partial<Filters>) =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            const val = Array.isArray(v) ? v.join(',') : String(v ?? '');
            if (val && !(k === 'page' && val === '1')) next.set(k, val);
            else next.delete(k);
          }
          if (!('page' in patch)) next.delete('page'); // filter/urutan berubah -> kembali ke halaman 1
          return next;
        },
        { replace: true },
      ),
    [setSp],
  );
  const clearFilters = useCallback(
    () =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const k of [...FILTER_KEYS, 'page']) next.delete(k);
          return next;
        },
        { replace: true },
      ),
    [setSp],
  );
  const openTask = (t: Task) => setSp((prev) => new URLSearchParams([...prev, ['task', t.id]]), { replace: false });
  const closeTask = () =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('task');
        return next;
      },
      { replace: true },
    );

  const filtered = hasActiveFilters(filters);
  const boardParams = filtersToParams(filters);
  const listParams = filtersToParams(filters, { page: filters.page, per_page: PER_PAGE });
  const board = useQuery({ queryKey: tk.board(project.id, boardParams), queryFn: () => getBoard(project.id, boardParams), enabled: view === 'board', placeholderData: keepPreviousData });
  const list = useQuery({ queryKey: tk.list(project.id, listParams), queryFn: () => listTasks(project.id, listParams), enabled: view === 'list', placeholderData: keepPreviousData });
  const q = view === 'board' ? board : list;

  return (
    <div>
      <div className="d-flex align-items-start gap-2">
        <div className="flex-grow-1">
          <TaskFilters filters={filters} members={members.data ?? []} onChange={setFilters} onClear={clearFilters} />
        </div>
        {!readOnly && (
          <button type="button" className="btn btn-primary btn-sm text-nowrap" onClick={() => setCreateStatus('todo')}>
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            Tugas baru
          </button>
        )}
      </div>
      {readOnly && (
        <div className="alert alert-secondary py-2" role="note">
          Proyek diarsipkan: tugas hanya bisa dilihat. Pulihkan di Pengaturan untuk mengubahnya.
        </div>
      )}

      {q.isLoading && <Spinner label="Memuat tugas..." />}
      {q.isError && <ErrorState message={parseError(q.error).message} onRetry={() => void q.refetch()} />}

      {view === 'board' && board.data && <KanbanBoard projectId={project.id} board={board.data} params={boardParams} readOnly={readOnly} filtered={filtered} onOpen={openTask} onAdd={setCreateStatus} />}

      {view === 'list' && list.data && (
        <>
          {list.data.tasks.length === 0 ? (
            <EmptyState
              icon={filtered ? 'bi-funnel' : 'bi-list-check'}
              title={filtered ? 'Tidak ada tugas yang cocok' : 'Belum ada tugas'}
              text={filtered ? 'Ubah atau hapus filter untuk melihat tugas lain.' : readOnly ? undefined : 'Buat tugas pertama untuk proyek ini.'}
              action={
                filtered ? (
                  <button type="button" className="btn btn-outline-primary" onClick={clearFilters}>
                    Hapus filter
                  </button>
                ) : undefined
              }
            />
          ) : (
            <TaskTable tasks={list.data.tasks} sort={filters.sort} onSort={(sort) => setFilters({ sort })} onOpen={openTask} />
          )}
          {list.data.meta.total_pages > 1 && (
            <nav className="d-flex align-items-center justify-content-between" aria-label="Halaman tugas">
              <span className="small text-secondary">
                {list.data.meta.total} tugas · halaman {list.data.meta.page} dari {list.data.meta.total_pages}
              </span>
              <div className="btn-group">
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={filters.page <= 1} onClick={() => setFilters({ page: filters.page - 1 })}>
                  Sebelumnya
                </button>
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={filters.page >= list.data.meta.total_pages} onClick={() => setFilters({ page: filters.page + 1 })}>
                  Berikutnya
                </button>
              </div>
            </nav>
          )}
        </>
      )}

      <TaskDetailPanel taskId={taskId} projectId={project.id} readOnly={readOnly} isOwner={isOwner} onClose={closeTask} />
      <CreateTaskModal show={createStatus !== null} projectId={project.id} initialStatus={createStatus ?? 'todo'} onHide={() => setCreateStatus(null)} onCreated={(id) => setSp((prev) => new URLSearchParams([...prev, ['task', id]]), { replace: true })} />
    </div>
  );
}
