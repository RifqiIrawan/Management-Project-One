import { Navigate, Outlet, useLocation } from 'react-router';
import Spinner from '@/components/common/Spinner';
import { useAuthStore } from '@/store/authStore';

/** Wajib login. Selama sesi belum dipulihkan (status unknown) tampilkan spinner, bukan halaman login. */
export default function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'unknown') return <Spinner label="Memuat sesi..." />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}