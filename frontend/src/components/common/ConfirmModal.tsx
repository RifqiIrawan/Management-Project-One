import { useState } from 'react';
import { Modal } from 'react-bootstrap';

interface Props {
  show: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** Bila diisi, pengguna harus mengetik teks ini persis sebelum tombol aktif. */
  requireText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onHide: () => void;
}

export default function ConfirmModal({ show, title, body, confirmLabel, requireText, danger = true, busy = false, onConfirm, onHide }: Props) {
  const [typed, setTyped] = useState('');
  const ok = !requireText || typed === requireText;
  return (
    <Modal show={show} onHide={onHide} centered onExited={() => setTyped('')}>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{body}</p>
        {requireText && (
          <>
            <label htmlFor="confirm-text" className="form-label small">
              Ketik <strong>{requireText}</strong> untuk melanjutkan
            </label>
            <input id="confirm-text" className="form-control" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-outline-secondary" onClick={onHide} disabled={busy}>
          Batal
        </button>
        <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok || busy} onClick={onConfirm}>
          {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          {confirmLabel}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
