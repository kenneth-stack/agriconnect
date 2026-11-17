import { useId, useState } from 'react';

// Password field with a Show / Hide button
export default function PasswordInput({ label = 'Password', value, onChange, ...rest }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className="pw">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} {...rest} />
        <button type="button" className="ghost" aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
    </div>
  );
}
