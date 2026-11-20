import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { changePassword, logoutAll, updateMe } from '@/api/me.api';
import Avatar from '@/components/common/Avatar';
import ConfirmModal from '@/components/common/ConfirmModal';
import PasswordInput from '@/components/common/PasswordInput';
import PasswordStrength from '@/components/common/PasswordStrength';
import { changePasswordSchema, profileSchema, type ChangePasswordForm, type ProfileForm } from '@/schemas/profile.schema';
import { PROJECT_COLORS } from '@/schemas/project.schema';
import { useAuthStore } from '@/store/authStore';
import { parseError } from '@/utils/errors';
import { fullDate } from '@/utils/format';

function ProfileCard() {
  const user = useAuthStore((s) => s.user);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema), mode: 'onTouched', defaultValues: { name: user?.name ?? '', avatar_color: user?.avatar_color ?? PROJECT_COLORS[0] } });
  const name = watch('name');
  const color = watch('avatar_color');
  const palette = Array.from(new Set([...(user?.avatar_color ? [user.avatar_color] : []), ...PROJECT_COLORS]));

  const save = useMutation({
    mutationFn: (v: ProfileForm) => updateMe({ name: v.name.trim(), avatar_color: v.avatar_color }),
    onSuccess: (u) => {
      reset({ name: u.name, avatar_color: u.avatar_color });
      toast.success('Profil diperbarui');
    },
    onError: (e) => {
      const err = parseError(e);
      if (err.code === 'VALIDATION_ERROR') {
        for (const [f, message] of Object.entries(err.details)) if (f === 'name' || f === 'avatar_color') setError(f, { message });
      }
      setFormError(err.message);
    },
  });

  if (!user) return null;
  return (
    <form
      className="panel"
      noValidate
      aria-label="Form profil"
      onSubmit={(e) => {
        setFormError(null);
        void handleSubmit((v) => save.mutate(v))(e);
      }}
    >
      <h2 className="panel-title mb-3">Profil</h2>
      <div className="d-flex align-items-center gap-3 mb-4">
        <Avatar name={name || user.name} color={color} size={64} />
        <div className="min-w-0">
          <div className="fw-semibold fs-5 text-truncate">{name || user.name}</div>
          <div className="text-secondary text-truncate">{user.email}</div>
          <div className="small text-secondary">Bergabung {fullDate(user.created_at)}</div>
        </div>
      </div>
      {formError && (
        <div className="alert alert-danger" role="alert">
          {formError}
        </div>
      )}
      <div className="mb-3">
        <label htmlFor="pf-name" className="form-label">
          Nama
        </label>
        <input id="pf-name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} autoComplete="name" {...register('name')} />
        {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
      </div>
      <div className="mb-3">
        <label htmlFor="pf-email" className="form-label">
          Email
        </label>
        <input id="pf-email" className="form-control" value={user.email} disabled readOnly />
        <div className="form-text">Email tidak dapat diubah.</div>
      </div>
      <fieldset className="mb-4">
        <legend className="form-label fs-6">Warna avatar</legend>
        <div className="d-flex gap-2 flex-wrap">
          {palette.map((c) => (
            <button key={c} type="button" className={`color-swatch${color.toLowerCase() === c.toLowerCase() ? ' is-selected' : ''}`} style={{ background: c }} aria-label={`Warna ${c}`} aria-pressed={color.toLowerCase() === c.toLowerCase()} onClick={() => setValue('avatar_color', c, { shouldDirty: true })} />
          ))}
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={!isDirty || save.isPending}>
        {save.isPending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
        Simpan profil
      </button>
    </form>
  );
}

function PasswordCard() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema), mode: 'onTouched', defaultValues: { current_password: '', new_password: '', confirm_password: '' } });
  const pw = watch('new_password') ?? '';

  const save = useMutation({
    mutationFn: (v: ChangePasswordForm) => changePassword({ current_password: v.current_password, new_password: v.new_password, confirm_password: v.confirm_password }),
    onSuccess: () => {
      reset();
      toast.success('Password diganti. Perangkat lain keluar otomatis.');
    },
    onError: (e) => {
      const err = parseError(e);
      if (err.code === 'VALIDATION_ERROR') {
        for (const [f, message] of Object.entries(err.details)) if (f === 'current_password' || f === 'new_password' || f === 'confirm_password') setError(f, { message });
      }
      setFormError(err.message);
    },
  });

  return (
    <form
      className="panel"
      noValidate
      aria-label="Form ganti password"
      onSubmit={(e) => {
        setFormError(null);
        void handleSubmit((v) => save.mutate(v))(e);
      }}
    >
      <h2 className="panel-title mb-3">Ganti password</h2>
      {formError && (
        <div className="alert alert-danger" role="alert">
          {formError}
        </div>
      )}
      <div className="mb-3">
        <label htmlFor="pw-current" className="form-label">
          Password saat ini
        </label>
        <PasswordInput id="pw-current" autoComplete="current-password" invalid={!!errors.current_password} {...register('current_password')} />
        {errors.current_password && <div className="invalid-feedback d-block">{errors.current_password.message}</div>}
      </div>
      <div className="mb-3">
        <label htmlFor="pw-new" className="form-label">
          Password baru
        </label>
        <PasswordInput id="pw-new" autoComplete="new-password" invalid={!!errors.new_password} {...register('new_password')} />
        {errors.new_password && <div className="invalid-feedback d-block">{errors.new_password.message}</div>}
        <PasswordStrength value={pw} />
      </div>
      <div className="mb-4">
        <label htmlFor="pw-confirm" className="form-label">
          Konfirmasi password baru
        </label>
        <PasswordInput id="pw-confirm" autoComplete="new-password" invalid={!!errors.confirm_password} {...register('confirm_password')} />
        {errors.confirm_password && <div className="invalid-feedback d-block">{errors.confirm_password.message}</div>}
      </div>
      <button type="submit" className="btn btn-primary" disabled={save.isPending}>
        {save.isPending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
        Ganti password
      </button>
    </form>
  );
}

function SessionsCard() {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const out = useMutation({
    mutationFn: logoutAll,
    onSuccess: () => {
      toast.success('Semua perangkat sudah keluar');
      navigate('/login', { replace: true });
    },
    onError: (e) => {
      setConfirm(false);
      toast.error(parseError(e).message);
    },
  });
  return (
    <div className="panel">
      <h2 className="panel-title mb-2">Sesi dan keamanan</h2>
      <p className="small text-secondary">Keluarkan akun Anda dari semua perangkat, termasuk yang ini. Berguna bila Anda merasa akun dipakai orang lain.</p>
      <button type="button" className="btn btn-outline-danger" onClick={() => setConfirm(true)}>
        Keluar dari semua perangkat
      </button>
      <ConfirmModal show={confirm} title="Keluar dari semua perangkat?" body="Semua sesi dicabut, termasuk perangkat ini. Anda perlu masuk kembali." confirmLabel="Keluar semua" busy={out.isPending} onConfirm={() => out.mutate()} onHide={() => setConfirm(false)} />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <section>
      <header className="page-head">
        <div>
          <p className="page-date">Akun</p>
          <h1>Profil</h1>
        </div>
      </header>
      <div className="d-flex flex-wrap gap-3 align-items-start">
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <ProfileCard />
        </div>
        <div className="d-grid gap-3" style={{ flex: '1 1 380px', minWidth: 0 }}>
          <PasswordCard />
          <SessionsCard />
        </div>
      </div>
    </section>
  );
}
