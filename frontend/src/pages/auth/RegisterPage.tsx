import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { register as registerAccount } from '@/api/auth.api';
import PasswordInput from '@/components/common/PasswordInput';
import PasswordStrength from '@/components/common/PasswordStrength';
import { registerSchema, type RegisterFormInput } from '@/schemas/auth.schema';
import { parseError } from '@/utils/errors';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput>({ resolver: zodResolver(registerSchema), mode: 'onTouched' });
  const pw = watch('password') ?? '';

  async function onSubmit(values: RegisterFormInput) {
    setFormError(null);
    try {
      await registerAccount(values);
      navigate('/', { replace: true });
    } catch (e) {
      const err = parseError(e);
      if (err.code === 'VALIDATION_ERROR') {
        for (const [field, message] of Object.entries(err.details)) {
          if (field === 'name' || field === 'email' || field === 'password' || field === 'confirm_password') setError(field, { message });
        }
      } else if (err.code === 'CONFLICT') {
        setError('email', { message: err.message });
      }
      setFormError(err.code === 'CONFLICT' ? null : err.message);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate aria-label="Form daftar">
      <h1 className="h3 fw-bold mb-1">Buat akun</h1>
      <p className="text-secondary mb-4">Mulai kelola proyek tim Anda.</p>

      {formError && (
        <div className="alert alert-danger" role="alert">
          {formError}
        </div>
      )}

      <div className="mb-3">
        <label htmlFor="name" className="form-label">
          Nama
        </label>
        <input id="name" autoComplete="name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} {...register('name')} />
        {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
      </div>
      <div className="mb-3">
        <label htmlFor="email" className="form-label">
          Email
        </label>
        <input id="email" type="email" autoComplete="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} {...register('email')} />
        {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
      </div>
      <div className="mb-3">
        <label htmlFor="password" className="form-label">
          Password
        </label>
        <PasswordInput id="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
        {errors.password && <div className="invalid-feedback d-block">{errors.password.message}</div>}
        <PasswordStrength value={pw} />
      </div>
      <div className="mb-4">
        <label htmlFor="confirm_password" className="form-label">
          Konfirmasi password
        </label>
        <PasswordInput id="confirm_password" autoComplete="new-password" invalid={!!errors.confirm_password} {...register('confirm_password')} />
        {errors.confirm_password && <div className="invalid-feedback d-block">{errors.confirm_password.message}</div>}
      </div>

      <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
        {isSubmitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
        Daftar
      </button>
      <p className="text-center text-secondary mt-4 mb-0">
        Sudah punya akun? <Link to="/login">Masuk</Link>
      </p>
    </form>
  );
}