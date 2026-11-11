import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & { login?: boolean; assetRoot?: string };
export function PasswordInput({ login = false, assetRoot = '/figma/', ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return <div className={'password-control' + (login ? ' login-control' : '')}>
    {login && <span className="control-icon"><img src={assetRoot + 'b062d.svg'} alt="" /></span>}
    <input {...props} type={visible ? 'text' : 'password'} />
    <button type="button" className="password-toggle" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
      <img src={assetRoot + (login ? 'f46b1.svg' : 'dbb07.svg')} alt="" />
    </button>
  </div>;
}

