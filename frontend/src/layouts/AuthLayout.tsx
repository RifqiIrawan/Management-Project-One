import { Outlet } from 'react-router';
import ThemeToggle from '@/components/common/ThemeToggle';

const FEATURES = [
  { icon: 'bi-kanban', text: 'Papan Kanban dengan drag & drop' },
  { icon: 'bi-people', text: 'Kolaborasi tim, komentar, dan riwayat' },
  { icon: 'bi-shield-lock', text: 'Setiap request ditandatangani dan diamankan' },
];

export default function AuthLayout() {
  return (
    <div className="container-fluid">
      <div className="row min-vh-100">
        <section className="col-lg-6 auth-hero d-none d-lg-flex flex-column justify-content-center p-5" aria-hidden="true">
          <div className="d-flex align-items-center gap-3 mb-5">
            <span className="brand-mark d-grid" style={{ width: 44, height: 44, borderRadius: 12, background: '#3b5bdb', placeItems: 'center', fontFamily: 'var(--bs-heading-font-family)', fontWeight: 700, fontSize: '0.95rem' }}>
              MPO
            </span>
            <span className="d-flex flex-column" style={{ lineHeight: 1.2 }}>
              <span className="fs-5 fw-semibold" style={{ fontFamily: 'var(--bs-heading-font-family)' }}>
                Project One
              </span>
              <span className="small" style={{ color: '#98a2b3' }}>
                Management Project One
              </span>
            </span>
          </div>
          <h1 className="display-5 fw-semibold mb-3" style={{ lineHeight: 1.1, maxWidth: 520 }}>
            Kelola proyek tim dalam satu tempat.
          </h1>
          <p className="fs-5 mb-5" style={{ color: '#d0d5dd', maxWidth: 480 }}>
            Tugas, progres, dan komunikasi tim dalam satu ruang kerja yang cepat dan jelas.
          </p>
          <div className="d-grid gap-3" style={{ maxWidth: 440 }}>
            {FEATURES.map((f) => (
              <div key={f.text} className="feature">
                <i className={`bi ${f.icon}`} />
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="col-12 col-lg-6 d-flex flex-column justify-content-center align-items-center p-3 p-sm-4 position-relative">
          <div className="position-absolute top-0 end-0 p-3">
            <ThemeToggle />
          </div>
          <div className="auth-panel">
            <Outlet />
          </div>
        </section>
      </div>
    </div>
  );
}
