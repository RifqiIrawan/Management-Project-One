import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="text-center py-5">
      <div className="display-1 fw-bold text-secondary">404</div>
      <p className="lead">Halaman tidak ditemukan.</p>
      <Link to="/" className="btn btn-primary">
        Kembali ke dashboard
      </Link>
    </div>
  );
}