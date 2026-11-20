import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { archiveProject, deleteProject, qk, updateProject } from '@/api/projects.api';
import ConfirmModal from '@/components/common/ConfirmModal';
import { editProjectSchema, PROJECT_COLORS, type EditProjectForm } from '@/schemas/project.schema';
import { parseError } from '@/utils/errors';
import { useProjectContext } from './ProjectLayout';

export default function ProjectSettingsPage() {
  const { project, isOwner } = useProjectContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty },
    reset,
  } = useForm<EditProjectForm>({
    resolver: zodResolver(editProjectSchema),
    mode: 'onTouched',
    defaultValues: { name: project.name, description: project.description ?? '', color: project.color, icon: project.icon ?? '' },
  });
  const color = watch('color');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.projectsAll });
    void qc.invalidateQueries({ queryKey: qk.project(project.id) });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
  };

  const save = useMutation({
    mutationFn: (v: EditProjectForm) => updateProject(project.id, v),
    onSuccess: (p) => {
      refresh();
      reset({ name: p.name, description: p.description ?? '', color: p.color, icon: p.icon ?? '' });
      toast.success('Perubahan disimpan');
    },
    onError: (e) => {
      const err = parseError(e);
      if (err.code === 'VALIDATION_ERROR') {
        for (const [f, message] of Object.entries(err.details)) {
          if (f === 'name' || f === 'description' || f === 'color' || f === 'icon') setError(f, { message });
        }
      }
      setFormError(err.message);
    },
  });

  const archive = useMutation({
    mutationFn: () => archiveProject(project.id, !project.archived_at),
    onSuccess: (p) => {
      refresh();
      toast.success(p.archived_at ? 'Proyek diarsipkan' : 'Proyek dipulihkan');
    },
    onError: (e) => toast.error(parseError(e).message),
  });

  const remove = useMutation({
    mutationFn: () => deleteProject(project.id, project.name),
    onSuccess: () => {
      qc.removeQueries({ queryKey: qk.project(project.id) });
      void qc.invalidateQueries({ queryKey: qk.projectsAll });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.success('Proyek dihapus');
      navigate('/projects', { replace: true });
    },
    onError: (e) => {
      setShowDelete(false);
      toast.error(parseError(e).message);
    },
  });

  if (!isOwner) {
    return (
      <div className="alert alert-secondary" role="note">
        <i className="bi bi-lock me-2" aria-hidden="true" />
        Hanya owner yang dapat mengubah pengaturan proyek.
      </div>
    );
  }

  return (
    <div className="row g-4">
      <div className="col-12 col-lg-7">
        <form
          noValidate
          aria-label="Form pengaturan proyek"
          onSubmit={(e) => {
            setFormError(null);
            void handleSubmit((v) => save.mutate(v))(e);
          }}
          className="card card-body"
        >
          <h2 className="h5 mb-3">Umum</h2>
          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}
          <div className="mb-3">
            <label htmlFor="s-name" className="form-label">
              Nama proyek
            </label>
            <input id="s-name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} {...register('name')} />
            {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
          </div>
          <div className="row g-3 mb-3">
            <div className="col-8">
              <label htmlFor="s-key" className="form-label">
                Kode
              </label>
              <input id="s-key" className="form-control" value={project.key} disabled readOnly />
            </div>
            <div className="col-4">
              <label htmlFor="s-icon" className="form-label">
                Ikon
              </label>
              <input id="s-icon" className="form-control" {...register('icon')} />
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="s-desc" className="form-label">
              Deskripsi
            </label>
            <textarea id="s-desc" rows={4} className={`form-control ${errors.description ? 'is-invalid' : ''}`} {...register('description')} />
            {errors.description && <div className="invalid-feedback">{errors.description.message}</div>}
          </div>
          <fieldset className="mb-3">
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
                  onClick={() => setValue('color', c, { shouldDirty: true })}
                />
              ))}
            </div>
          </fieldset>
          <div>
            <button type="submit" className="btn btn-primary" disabled={!isDirty || save.isPending}>
              {save.isPending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
              Simpan perubahan
            </button>
          </div>
        </form>
      </div>

      <div className="col-12 col-lg-5">
        <div className="card card-body mb-3">
          <h2 className="h5">{project.archived_at ? 'Pulihkan proyek' : 'Arsipkan proyek'}</h2>
          <p className="small text-secondary">
            {project.archived_at
              ? 'Proyek akan muncul kembali di daftar dan tugasnya bisa diubah lagi.'
              : 'Proyek disembunyikan dari daftar dan tugasnya menjadi read-only. Bisa dipulihkan kapan saja.'}
          </p>
          <div>
            <button type="button" className="btn btn-outline-secondary" onClick={() => archive.mutate()} disabled={archive.isPending}>
              {project.archived_at ? 'Pulihkan' : 'Arsipkan'}
            </button>
          </div>
        </div>
        <div className="card card-body border-danger">
          <h2 className="h5 text-danger">Hapus proyek</h2>
          <p className="small text-secondary">Semua tugas, komentar, dan riwayat ikut terhapus permanen. Tindakan ini tidak bisa dibatalkan.</p>
          <div>
            <button type="button" className="btn btn-danger" onClick={() => setShowDelete(true)}>
              Hapus proyek
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        show={showDelete}
        title="Hapus proyek?"
        body={`Proyek "${project.name}" dan seluruh isinya akan dihapus permanen.`}
        requireText={project.name}
        confirmLabel="Hapus permanen"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onHide={() => setShowDelete(false)}
      />
    </div>
  );
}
