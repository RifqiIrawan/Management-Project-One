import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { login } from '@/api/auth.api';
import PasswordInput from '@/components/common/PasswordInput';
import { loginSchema, type LoginInput } from '@/schemas/auth.schema';
import { parseError } from '@/utils/errors';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: 'onTouched' });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (e) {
      const err = parseError(e);
      if (err.code === 'VALIDATION_ERROR') {
        for (const [field, message] of Object.entries(err.details)) {
          if (field === 'email' || field === 'password') setError(field, { message });
        }
      }
      // pesan umum dari server ("Email atau password salah") ditampilkan apa adanya: tidak membocorkan akun terdaftar
      setFormError(err.message);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate aria-label="Form masuk">
      <h1 className="h3 fw-bold mb-1">Masuk</h1>
      <p className="text-secondary mb-4">Selamat datang kembali. Masuk untuk melanjutkan.</p>

      {formError && (
        <div className="alert alert-danger" role="alert">
          {formError}
        </div>
      )}

      <div className="mb-3">
        <label htmlFor="email" className="form-label">
          Email
        </label>
        <input id="email" type="email" autoComplete="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} aria-invalid={!!errors.email} {...register('email')} />
        {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
      </div>

      <div className="mb-4">
        <label htmlFor="password" className="form-label">
          Password
        </label>
        <PasswordInput id="password" autoComplete="current-password" invalid={!!errors.password} aria-invalid={!!errors.password} {...register('password')} />
        {errors.password && <div className="invalid-feedback d-block">{errors.password.message}</div>}
      </div>

      <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
        {isSubmitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
        Masuk
      </button>
      <p className="text-center text-secondary mt-4 mb-0">
        Belum punya akun? <Link to="/register">Daftar</Link>
      </p>
    </form>
  );
}