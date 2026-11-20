import { useState } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { Outlet } from 'react-router';
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar d-none d-lg-block${collapsed ? ' is-collapsed' : ''}`}>
        <Sidebar collapsed={collapsed} />
      </aside>
      <Offcanvas show={menuOpen} onHide={() => setMenuOpen(false)} responsive="lg" className="d-lg-none" style={{ width: 280 }}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Menu</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </Offcanvas.Body>
      </Offcanvas>
      <div className={`app-main${collapsed ? ' is-collapsed' : ''}`}>
        <Topbar onMenu={() => setMenuOpen(true)} onToggleCollapse={() => setCollapsed((c) => !c)} />
        <main className="container-fluid px-3 px-lg-4 py-3">
          <div className="mb-3">
            <Breadcrumbs />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}