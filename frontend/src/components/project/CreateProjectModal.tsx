import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { createProject, qk } from '@/api/projects.api';
import { createProjectSchema, PROJECT_COLORS, suggestKey, type CreateProjectForm, type CreateProjectOutput } from '@/schemas/project.schema';
import { parseError } from '@/utils/errors';

export default function CreateProjectModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateProjectForm, unknown, CreateProjectOutput>({
    resolver: zodResolver(createProjectSchema),
    mode: 'onTouched',
    defaultValues: { name: '', key: '', description: '', color: PROJECT_COLORS[0], icon: '' },
  });
  const color = watch('color');

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: qk.projectsAll });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.success(`Proyek ${p.name} dibuat`);
      close();
      navigate(`/projects/${p.id}`);
    },
    onError: (e) => {
      const err = parseError(e);
      if (err.code === 'VALIDATION_ERROR') {
        for (const [f, message] of Object.entries(err.details)) {
          if (f === 'name' || f === 'key' || f === 'description' || f === 'color' || f === 'icon') setError(f, { message });
        }
      } else if (err.code === 'CONFLICT') {
        setError('key', { message: 'Kode ini sudah dipakai proyek lain' });
      }
      setFormError(err.code === 'CONFLICT' ? null : err.message);
    },
  });

  function close() {
    reset();
    setFormError(null);
    setKeyTouched(false);
    onHide();
  }

  return (
    <Modal show={show} onHide={close} centered>
      <form
        noValidate
        aria-label="Form proyek baru"
        onSubmit={(e) => {
          setFormError(null);
          void handleSubmit((v) => mutation.mutate({ name: v.name, key: v.key, description: v.description, color: v.color, icon: v.icon }))(e);
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            Proyek baru
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}
          <div className="mb-3">
            <label htmlFor="p-name" className="form-label">
              Nama proyek
            </label>
            <input
              id="p-name"
              className={`form-control ${errors.name ? 'is-invalid' : ''}`}
              {...register('name', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  if (!keyTouched) setValue('key', suggestKey(e.target.value));
                },
              })}
            />
            {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
          </div>
          <div className="row g-3 mb-3">
            <div className="col-8">
              <label htmlFor="p-key" className="form-label">
                Kode (tidak bisa diubah)
              </label>
              <input id="p-key" className={`form-control text-uppercase ${errors.key ? 'is-invalid' : ''}`} maxLength={5} {...register('key', { onChange: () => setKeyTouched(true) })} />
              {errors.key ? <div className="invalid-feedback">{errors.key.message}</div> : <div className="form-text">Contoh: MPO, menjadi MPO-1 pada tugas</div>}
            </div>
            <div className="col-4">
              <label htmlFor="p-icon" className="form-label">
                Ikon
              </label>
              <input id="p-icon" className="form-control" placeholder="🚀" {...register('icon')} />
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="p-desc" className="form-label">
              Deskripsi (opsional)
            </label>
            <textarea id="p-desc" rows={3} className={`form-control ${errors.description ? 'is-invalid' : ''}`} {...register('description')} />
            {errors.description && <div className="invalid-feedback">{errors.description.message}</div>}
          </div>
          <fieldset>
            <legend className="form-label fs-6">Warna</legend>
            <div className="d-flex gap-2 flex-wrap">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch${color === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  aria-label={`Warna ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setValue('color', c)}
                />
              ))}
            </div>
          </fieldset>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-outline-secondary" onClick={close}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            Buat proyek
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
