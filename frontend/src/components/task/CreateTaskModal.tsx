import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { qk, listMembers } from '@/api/projects.api';
import { createTask, tk } from '@/api/tasks.api';
import { createTaskSchema, parseLabels, validateLabels, type CreateTaskForm } from '@/schemas/task.schema';
import type { TaskStatus } from '@/types/api';
import { PRIORITIES, PRIORITY_CONFIG, STATUS_CONFIG, STATUSES } from '@/utils/constants';
import { parseError } from '@/utils/errors';

interface Props {
  show: boolean;
  projectId: string;
  initialStatus?: TaskStatus;
  onHide: () => void;
  onCreated?: (taskId: string) => void;
}

const FIELDS = ['title', 'description', 'status', 'priority', 'assignee_id', 'start_date', 'due_date', 'labels'] as const;

export default function CreateTaskModal({ show, projectId, initialStatus = 'todo', onHide, onCreated }: Props) {
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const members = useQuery({ queryKey: qk.members(projectId), queryFn: () => listMembers(projectId), enabled: show });
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<CreateTaskForm>({
    resolver: zodResolver(createTaskSchema),
    mode: 'onTouched',
    values: { title: '', description: '', status: initialStatus, priority: 'medium', assignee_id: '', start_date: '', due_date: '', labels: '' },
  });

  const mutation = useMutation({
    mutationFn: (v: CreateTaskForm) => {
      const labels = parseLabels(v.labels);
      return createTask(projectId, {
        title: v.title.trim(),
        status: v.status,
        priority: v.priority,
        ...(v.description.trim() ? { description: v.description } : {}),
        ...(v.assignee_id ? { assignee_id: v.assignee_id } : {}),
        ...(v.start_date ? { start_date: v.start_date } : {}),
        ...(v.due_date ? { due_date: v.due_date } : {}),
        ...(labels.length ? { labels } : {}),
      });
    },
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: tk.tasks(projectId) });
      void qc.invalidateQueries({ queryKey: qk.project(projectId) });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.success(`${t.code} dibuat`);
      close();
      onCreated?.(t.id);
    },
    onError: (e) => {
      const err = parseError(e);
      if (err.code === 'VALIDATION_ERROR') {
        for (const [f, message] of Object.entries(err.details)) {
          if ((FIELDS as readonly string[]).includes(f)) setError(f as (typeof FIELDS)[number], { message });
        }
      }
      setFormError(err.message);
    },
  });

  function close() {
    reset();
    setFormError(null);
    onHide();
  }

  return (
    <Modal show={show} onHide={close} centered size="lg">
      <form
        noValidate
        aria-label="Form tugas baru"
        onSubmit={(e) => {
          setFormError(null);
          void handleSubmit((v) => {
            const labelError = validateLabels(parseLabels(v.labels));
            if (labelError) return setError('labels', { message: labelError });
            mutation.mutate(v);
          })(e);
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            Tugas baru
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}
          <div className="mb-3">
            <label htmlFor="t-title" className="form-label">
              Judul
            </label>
            <input id="t-title" autoFocus className={`form-control ${errors.title ? 'is-invalid' : ''}`} {...register('title')} />
            {errors.title && <div className="invalid-feedback">{errors.title.message}</div>}
          </div>
          <div className="mb-3">
            <label htmlFor="t-desc" className="form-label">
              Deskripsi (opsional)
            </label>
            <textarea id="t-desc" rows={3} className={`form-control ${errors.description ? 'is-invalid' : ''}`} {...register('description')} />
            {errors.description && <div className="invalid-feedback">{errors.description.message}</div>}
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6 col-md-3">
              <label htmlFor="t-status" className="form-label">
                Status
              </label>
              <select id="t-status" className="form-select" {...register('status')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label htmlFor="t-priority" className="form-label">
                Prioritas
              </label>
              <select id="t-priority" className="form-select" {...register('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="t-assignee" className="form-label">
                Penanggung jawab
              </label>
              <select id="t-assignee" className="form-select" {...register('assignee_id')}>
                <option value="">Belum di-assign</option>
                {(members.data ?? []).map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6">
              <label htmlFor="t-start" className="form-label">
                Mulai
              </label>
              <input id="t-start" type="date" className={`form-control ${errors.start_date ? 'is-invalid' : ''}`} {...register('start_date')} />
              {errors.start_date && <div className="invalid-feedback">{errors.start_date.message}</div>}
            </div>
            <div className="col-6">
              <label htmlFor="t-due" className="form-label">
                Deadline
              </label>
              <input id="t-due" type="date" className={`form-control ${errors.due_date ? 'is-invalid' : ''}`} {...register('due_date')} />
              {errors.due_date && <div className="invalid-feedback">{errors.due_date.message}</div>}
            </div>
          </div>
          <div>
            <label htmlFor="t-labels" className="form-label">
              Label (pisahkan dengan koma, maks. 5)
            </label>
            <input id="t-labels" className={`form-control ${errors.labels ? 'is-invalid' : ''}`} placeholder="bug, frontend" {...register('labels')} />
            {errors.labels && <div className="invalid-feedback">{errors.labels.message}</div>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-outline-secondary" onClick={close}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            Buat tugas
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
