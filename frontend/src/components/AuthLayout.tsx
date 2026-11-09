import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AccessArea } from '../auth/access';
import { Brand } from './Brand';

export function AuthLayout({ children, area = 'participant', variant = 'login' }: { children: ReactNode; area?: AccessArea; variant?: 'login' | 'register' }) {
  return <div className={'auth-page ' + (variant === 'register' ? 'registration-page' : 'login-page') + (area === 'organization' ? ' organization-auth' : ' participant-auth')}>
    <nav className="auth-area-nav" aria-label="Área de acesso"><Link to="/acesso">← Escolher tipo de acesso</Link><span>{area === 'participant' ? 'Participante' : 'Organização'}</span></nav>
    <main className={'auth-frame ' + (variant === 'register' ? 'registration-frame' : 'login-frame')}>
      {children}<div className="auth-brand"><Brand login={variant === 'login'} /></div>
    </main>
  </div>;
}

