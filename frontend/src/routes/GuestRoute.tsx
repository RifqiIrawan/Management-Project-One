import { Navigate, Outlet } from 'react-router';
import Spinner from '@/components/common/Spinner';
import { useAuthStore } from '@/store/authStore';

/** Hanya untuk yang belum login (login/register). */
export default function GuestRoute() {
  const status = useAuthStore((s) => s.status);
  if (status === 'unknown') return <Spinner label="Memuat sesi..." />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}