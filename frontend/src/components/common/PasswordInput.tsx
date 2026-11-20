import { forwardRef, useState, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

/** Input password dengan tombol tampil/sembunyi (aksesibel). */
const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput({ invalid, className = '', ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-group has-validation">
      <input ref={ref} type={show ? 'text' : 'password'} className={`form-control ${invalid ? 'is-invalid' : ''} ${className}`} {...rest} />
      <button type="button" className="btn btn-outline-secondary" aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShow((s) => !s)}>
        <i className={`bi ${show ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
      </button>
    </div>
  );
});

export default PasswordInput;