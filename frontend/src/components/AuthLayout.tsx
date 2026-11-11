import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AccessArea } from '../auth/access';
import { Brand } from './Brand';

export function AuthLayout({ children, area = 'participant', variant = 'login' }: { children: ReactNode; area?: AccessArea; variant?: 'login' | 'register' }) {
  const exactLogin = area === 'organization' && variant === 'login';
  return <div className={'auth-page ' + (variant === 'register' ? 'registration-page' : 'login-page') + (area === 'organization' ? ' organization-auth' : ' participant-auth') + (exactLogin ? ' figma-organization-login' : '')}>
    <nav className="auth-area-nav" aria-label="Área de acesso"><Link to={variant === 'register' ? '/cadastro' : '/acesso'}>← Escolher tipo de {variant === 'register' ? 'cadastro' : 'acesso'}</Link><span>{area === 'participant' ? 'Participante' : 'Organização'}</span></nav>
    <main className={'auth-frame ' + (variant === 'register' ? 'registration-frame' : 'login-frame')}>
      {children}<div className="auth-brand"><Brand login={variant === 'login'} design={exactLogin ? 'blue' : undefined} /></div>
    </main>
  </div>;
}

