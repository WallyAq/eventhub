import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { accountDestination } from './access';
import type { AccessArea } from './access';

export function RequireAccount({ area, children }: { area: AccessArea; children: ReactNode }) {
  const { session } = useAuth();
  if (!session) return <Navigate to={area === 'organization' ? '/organizacao/login' : '/participante/login'} replace />;
  const expectedRole = area === 'organization' ? 'ORGANIZER' : 'PARTICIPANT';
  if (session.user.role !== expectedRole) return <Navigate to={accountDestination(session.user.role)} replace />;
  return children;
}
