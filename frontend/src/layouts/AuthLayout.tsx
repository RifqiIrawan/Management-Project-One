import { Outlet } from 'react-router';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function AuthLayout() {
  return (
    <div className="container-fluid">
      <div className="row min-vh-100">
        <section className="col-lg-6 auth-hero d-none d-lg-flex flex-column justify-content-center p-5" aria-hidden="true">
          <div className="mb-4 fs-1">
            <i className="bi bi-kanban" />
          </div>
          <h1 className="display-6 fw-bold">Kelola proyek dan tugas tim dalam satu tempat.</h1>
          <p className="fs-5 opacity-75 mb-0">Papan Kanban, pembagian tugas, komentar, dan progres yang jelas untuk setiap anggota.</p>
        </section>
        <section className="col-12 col-lg-6 d-flex flex-column justify-content-center align-items-center p-4">
          <div className="position-absolute top-0 end-0 p-3">
            <ThemeToggle />
          </div>
          <div className="w-100" style={{ maxWidth: 420 }}>
            <Outlet />
          </div>
        </section>
      </div>
    </div>
  );
}