import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
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
import { COLUMN_DEFS, PAGE_SIZES, useViewStore } from '@/store/viewStore';
import type { Task, TaskStatus } from '@/types/api';
import { parseError } from '@/utils/errors';
import { filtersFromSearch, filtersToParams, hasActiveFilters, type TaskFilters as Filters } from '@/utils/taskLogic';
import { useProjectContext } from './ProjectLayout';

const FILTER_KEYS = ['q', 'status', 'priority', 'assignee', 'due'] as const;

export default function TaskWorkspace({ view }: { view: 'board' | 'list' }) {
  const { project, isOwner } = useProjectContext();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(sp), [sp]);
  const taskId = sp.get('task');
  const readOnly = !!project.archived_at;
  const { density, columns, pageSize, setDensity, toggleColumn, resetColumns, setPageSize } = useViewStore();
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
  // set (bukan append): membuka tugas lain mengganti ?task=, tidak menumpuk parameter
  const withTask = (id: string) => (prev: URLSearchParams) => {
    const next = new URLSearchParams(prev);
    next.set('task', id);
    return next;
  };
  const openTask = (t: Task) => setSp(withTask(t.id), { replace: false });
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
  const listParams = filtersToParams(filters, { page: filters.page, per_page: pageSize });
  const board = useQuery({ queryKey: tk.board(project.id, boardParams), queryFn: () => getBoard(project.id, boardParams), enabled: view === 'board', placeholderData: keepPreviousData });
  const list = useQuery({ queryKey: tk.list(project.id, listParams), queryFn: () => listTasks(project.id, listParams), enabled: view === 'list', placeholderData: keepPreviousData });
  const q = view === 'board' ? board : list;

  return (
    <div className={`task-workspace density-${density}`}>
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
      <div className="view-options d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="segmented" role="group" aria-label="Kepadatan tampilan">
          <button type="button" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}>
            Nyaman
          </button>
          <button type="button" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>
            Padat
          </button>
        </div>
        {view === 'list' && (
          <>
            <Dropdown autoClose="outside">
              <Dropdown.Toggle variant="outline-secondary" size="sm" aria-label="Pilih kolom tabel">
                <i className="bi bi-layout-three-columns me-1" aria-hidden="true" />
                Kolom
                <span className="badge text-bg-light ms-1">{columns.length}</span>
              </Dropdown.Toggle>
              <Dropdown.Menu className="p-2" style={{ minWidth: 220 }}>
                {COLUMN_DEFS.map((c) => (
                  <div key={c.id} className="form-check">
                    <input className="form-check-input" type="checkbox" id={`col-${c.id}`} checked={columns.includes(c.id)} disabled={c.locked} onChange={() => toggleColumn(c.id)} />
                    <label className="form-check-label w-100" htmlFor={`col-${c.id}`}>
                      {c.label}
                    </label>
                  </div>
                ))}
                <button type="button" className="btn btn-link btn-sm p-0 mt-2" onClick={resetColumns}>
                  Kembalikan bawaan
                </button>
              </Dropdown.Menu>
            </Dropdown>
            <div className="d-flex align-items-center gap-2 ms-auto">
              <label htmlFor="page-size" className="small text-secondary mb-0">
                Per halaman
              </label>
              <select id="page-size" className="form-select form-select-sm w-auto" value={pageSize} onChange={(e) => (setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]), setFilters({ page: 1 }))}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </>
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
            <TaskTable tasks={list.data.tasks} sort={filters.sort} onSort={(sort) => setFilters({ sort })} onOpen={openTask} columns={columns} density={density} />
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
      <CreateTaskModal show={createStatus !== null} projectId={project.id} initialStatus={createStatus ?? 'todo'} onHide={() => setCreateStatus(null)} onCreated={(id) => setSp(withTask(id), { replace: true })} />
    </div>
  );
}
