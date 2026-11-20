import { Modal } from 'react-bootstrap';
import { SHORTCUTS } from '@/hooks/useGlobalShortcuts';

export default function ShortcutsHelp({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide} centered aria-label="Pintasan keyboard">
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          Pintasan keyboard
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ul className="list-unstyled mb-0 d-grid gap-2" aria-label="Daftar pintasan">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="d-flex align-items-center justify-content-between gap-3">
              <span>{s.label}</span>
              <span className="d-inline-flex align-items-center gap-1 text-nowrap">
                {s.keys.map((k, i) => (
                  <span key={k} className="d-inline-flex align-items-center gap-1">
                    {i > 0 && <span className="small text-secondary">{s.sequence ? 'lalu' : '+'}</span>}
                    <kbd className="kbd">{k}</kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="small text-secondary mt-3 mb-0">Pintasan huruf tidak aktif saat Anda mengetik di kolom isian.</p>
      </Modal.Body>
    </Modal>
  );
}
