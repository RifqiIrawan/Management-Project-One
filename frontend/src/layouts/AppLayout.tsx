import { Suspense, useCallback, useState } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { Outlet } from 'react-router';
import CommandPalette from '@/components/common/CommandPalette';
import ShortcutsHelp from '@/components/common/ShortcutsHelp';
import { SkeletonPage } from '@/components/common/Skeleton';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  useGlobalShortcuts({ onPalette: openPalette, onHelp: openHelp });

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
        <Topbar onMenu={() => setMenuOpen(true)} onToggleCollapse={() => setCollapsed((c) => !c)} onSearch={openPalette} onHelp={openHelp} />
        <main className="container-fluid px-3 px-lg-4 py-3">
          <div className="mb-3">
            <Breadcrumbs />
          </div>
          <Suspense fallback={<SkeletonPage />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette show={paletteOpen} onHide={() => setPaletteOpen(false)} />
      <ShortcutsHelp show={helpOpen} onHide={() => setHelpOpen(false)} />
    </div>
  );
}