import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Offcanvas } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { listMembers, qk } from '@/api/projects.api';
import { deleteTask, getTask, tk, updateTask } from '@/api/tasks.api';
import ConfirmModal from '@/components/common/ConfirmModal';
import ErrorState from '@/components/common/ErrorState';
import Spinner from '@/components/common/Spinner';
import { parseLabels, validateLabels } from '@/schemas/task.schema';
import { useAuthStore } from '@/store/authStore';
import type { Task, TaskPriority, TaskStatus, UpdateTaskRequest } from '@/types/api';
import { PRIORITIES, PRIORITY_CONFIG, STATUS_CONFIG, STATUSES } from '@/utils/constants';
import { parseError } from '@/utils/errors';
import { labelColor } from '@/utils/constants';
import ActivityList from './ActivityList';
import { PriorityBadge, StatusBadge } from './badges';
import CommentSection from './CommentSection';

interface Props {
  taskId: string | null;
  projectId: string;
  readOnly: boolean;
  isOwner: boolean;
  onClose: () => void;
}

function Body({ task, projectId, readOnly, isOwner, onClose }: { task: Task; projectId: string; readOnly: boolean; isOwner: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const members = useQuery({ queryKey: qk.members(projectId), queryFn: () => listMembers(projectId) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: tk.tasks(projectId) });
    void qc.invalidateQueries({ queryKey: tk.activities(task.id) });
    void qc.invalidateQueries({ queryKey: qk.project(projectId) });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
  };

  const patch = useMutation({
    mutationFn: (body: UpdateTaskRequest) => updateTask(task.id, body),
    onSuccess: (t) => {
      qc.setQueryData(tk.task(task.id), t);
      refresh();
    },
    onError: (e) => {
      const err = parseError(e);
      const first = Object.values(err.details)[0];
      toast.error(first ?? err.message);
      void qc.invalidateQueries({ queryKey: tk.task(task.id) }); // kembalikan tampilan ke data server
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteTask(task.id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: tk.task(task.id) });
      refresh();
      toast.success(`${task.code} dihapus`);
      onClose();
    },
    onError: (e) => {
      setConfirmDelete(false);
      toast.error(parseError(e).message);
    },
  });

  const canDelete = !readOnly && (isOwner || task.created_by.id === me);

  function saveDates(start: string, due: string) {
    if (start && due && due < start) return setDateError('Deadline tidak boleh sebelum tanggal mulai');
    setDateError(null);
    patch.mutate({ start_date: start || null, due_date: due || null });
  }

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3" aria-label="Ringkasan tugas">
        <span className="task-code">{task.code}</span>
        {task.labels.slice(0, 3).map((l) => (
          <span key={l} className="tint" style={{ '--c': labelColor(l) } as React.CSSProperties}>
            {l}
          </span>
        ))}
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
      </div>
      <div className="mb-3">
        <label htmlFor="d-title" className="form-label small text-secondary">
          Judul
        </label>
        <input
          id="d-title"
          key={`${task.id}-${task.title}`}
          className="form-control fw-semibold"
          defaultValue={task.title}
          maxLength={200}
          disabled={readOnly}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v) return void (e.target.value = task.title);
            if (v !== task.title) patch.mutate({ title: v });
          }}
        />
      </div>

      <div className="row g-3 mb-3">
        <div className="col-6">
          <label htmlFor="d-status" className="form-label small text-secondary">
            Status
          </label>
          <select id="d-status" className="form-select form-select-sm" value={task.status} disabled={readOnly} onChange={(e) => patch.mutate({ status: e.target.value as TaskStatus })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6">
          <label htmlFor="d-priority" className="form-label small text-secondary">
            Prioritas
          </label>
          <select id="d-priority" className="form-select form-select-sm" value={task.priority} disabled={readOnly} onChange={(e) => patch.mutate({ priority: e.target.value as TaskPriority })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_CONFIG[p].label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12">
          <label htmlFor="d-assignee" className="form-label small text-secondary">
            Penanggung jawab
          </label>
          <select id="d-assignee" className="form-select form-select-sm" value={task.assignee?.id ?? ''} disabled={readOnly} onChange={(e) => patch.mutate({ assignee_id: e.target.value || null })}>
            <option value="">Belum di-assign</option>
            {(members.data ?? []).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6">
          <label htmlFor="d-start" className="form-label small text-secondary">
            Mulai
          </label>
          <input id="d-start" type="date" className="form-control form-control-sm" defaultValue={task.start_date ?? ''} key={`s-${task.start_date}`} disabled={readOnly} onBlur={(e) => e.target.value !== (task.start_date ?? '') && saveDates(e.target.value, task.due_date ?? '')} />
        </div>
        <div className="col-6">
          <label htmlFor="d-due" className="form-label small text-secondary">
            Deadline
          </label>
          <input id="d-due" type="date" className={`form-control form-control-sm ${dateError ? 'is-invalid' : ''}`} defaultValue={task.due_date ?? ''} key={`d-${task.due_date}`} disabled={readOnly} onBlur={(e) => e.target.value !== (task.due_date ?? '') && saveDates(task.start_date ?? '', e.target.value)} />
          {dateError && <div className="invalid-feedback">{dateError}</div>}
        </div>
      </div>

      <div className="mb-3">
        <label htmlFor="d-labels" className="form-label small text-secondary">
          Label (pisahkan dengan koma)
        </label>
        <input
          id="d-labels"
          key={`l-${task.labels.join(',')}`}
          className={`form-control form-control-sm ${labelError ? 'is-invalid' : ''}`}
          defaultValue={task.labels.join(', ')}
          disabled={readOnly}
          onBlur={(e) => {
            const labels = parseLabels(e.target.value);
            const err = validateLabels(labels);
            setLabelError(err);
            if (!err && labels.join('\n') !== task.labels.join('\n')) patch.mutate({ labels });
          }}
        />
        {labelError && <div className="invalid-feedback">{labelError}</div>}
      </div>

      <div className="mb-4">
        <label htmlFor="d-desc" className="form-label small text-secondary">
          Deskripsi
        </label>
        <textarea
          id="d-desc"
          key={`ds-${task.description ?? ''}`}
          className="form-control"
          rows={5}
          defaultValue={task.description ?? ''}
          disabled={readOnly}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (task.description ?? '')) patch.mutate({ description: v.trim() === '' ? null : v });
          }}
        />
      </div>

      <ul className="nav nav-pills mb-3" aria-label="Komentar dan riwayat">
        <li className="nav-item">
          <button type="button" className={`nav-link py-1${tab === 'comments' ? ' active' : ''}`} aria-pressed={tab === 'comments'} onClick={() => setTab('comments')}>
            Komentar ({task.comment_count})
          </button>
        </li>
        <li className="nav-item">
          <button type="button" className={`nav-link py-1${tab === 'activity' ? ' active' : ''}`} aria-pressed={tab === 'activity'} onClick={() => setTab('activity')}>
            Riwayat
          </button>
        </li>
      </ul>
      {tab === 'comments' ? <CommentSection taskId={task.id} projectId={projectId} readOnly={readOnly} /> : <ActivityList taskId={task.id} />}

      {canDelete && (
        <div className="mt-4 pt-3 border-top">
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setConfirmDelete(true)}>
            <i className="bi bi-trash me-1" aria-hidden="true" />
            Hapus tugas
          </button>
        </div>
      )}
      <ConfirmModal show={confirmDelete} title="Hapus tugas?" body={`${task.code} "${task.title}" beserta komentar dan riwayatnya akan dihapus permanen.`} confirmLabel="Hapus" busy={remove.isPending} onConfirm={() => remove.mutate()} onHide={() => setConfirmDelete(false)} />
    </>
  );
}

export default function TaskDetailPanel({ taskId, projectId, readOnly, isOwner, onClose }: Props) {
  const { data: task, isLoading, isError, error, refetch } = useQuery({ queryKey: tk.task(taskId ?? ''), queryFn: () => getTask(taskId ?? ''), enabled: !!taskId });
  const missing = isError && parseError(error).code === 'NOT_FOUND';
  return (
    <Offcanvas show={!!taskId} onHide={onClose} placement="end" style={{ width: 520, maxWidth: '100vw' }} aria-label="Detail tugas">
      <Offcanvas.Header closeButton>
        <Offcanvas.Title as="h2" className="h5">
          {task ? task.code : 'Tugas'}
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        {isLoading && <Spinner label="Memuat tugas..." />}
        {missing && <p className="text-secondary">Tugas tidak ditemukan atau sudah dihapus.</p>}
        {isError && !missing && <ErrorState message={parseError(error).message} onRetry={() => void refetch()} />}
        {task && task.project_id === projectId && <Body key={task.id} task={task} projectId={projectId} readOnly={readOnly} isOwner={isOwner} onClose={onClose} />}
        {task && task.project_id !== projectId && <p className="text-secondary">Tugas ini bukan bagian dari proyek ini.</p>}
      </Offcanvas.Body>
    </Offcanvas>
  );
}
