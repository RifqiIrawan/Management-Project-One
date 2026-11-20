import { Dropdown } from 'react-bootstrap';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import Avatar from '@/components/common/Avatar';
import ThemeToggle from '@/components/common/ThemeToggle';
import { logout } from '@/api/auth.api';
import { useAuthStore } from '@/store/authStore';

interface Props {
  onMenu: () => void;
  onToggleCollapse: () => void;
}

export default function Topbar({ onMenu, onToggleCollapse }: Props) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
    toast.success('Anda sudah keluar');
  }

  return (
    <header className="app-topbar d-flex align-items-center gap-2 px-3 py-2">
      <button type="button" className="icon-btn d-lg-none" aria-label="Buka menu" onClick={onMenu}>
        <i className="bi bi-list fs-5" aria-hidden="true" />
      </button>
      <button type="button" className="icon-btn d-none d-lg-inline-grid" aria-label="Ciutkan atau lebarkan sidebar" onClick={onToggleCollapse}>
        <i className="bi bi-layout-sidebar-inset fs-5" aria-hidden="true" />
      </button>
      <div className="flex-grow-1" />
      <ThemeToggle />
      {user && (
        <Dropdown align="end">
          <Dropdown.Toggle variant="link" className="p-0 text-decoration-none d-flex align-items-center gap-2" aria-label="Menu pengguna">
            <span className="avatar-ring">
              <Avatar name={user.name} color={user.avatar_color} />
            </span>
            <span className="d-none d-md-inline text-body fw-medium">{user.name}</span>
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.ItemText className="small text-secondary">{user.email}</Dropdown.ItemText>
            <Dropdown.Divider />
            <Dropdown.Item onClick={() => void onLogout()}>
              <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
              Keluar
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      )}
    </header>
  );
}