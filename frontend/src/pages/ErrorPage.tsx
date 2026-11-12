import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppLayout } from '../components/AppLayout';
import { Brand } from '../components/Brand';
import { ErrorScreen } from '../components/ErrorScreen';

export function ErrorPage({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { code } = useParams();
  const { session } = useAuth();
  const screen = <ErrorScreen error={error ?? { status: Number(code) }} onRetry={onRetry ?? (() => window.location.reload())} />;
  return <div className="error-page">{session ? <AppLayout area={session.user.role === 'ORGANIZER' ? 'organization' : 'participant'}>{screen}</AppLayout> : <div className="error-page__shell">
    <header className="topbar"><Brand design="blue" /><nav className="topnav" aria-label="Navegação principal"><Link to="/">Página Inicial</Link></nav></header>
    {screen}
    <footer className="error-page__footer"><Brand design="blue" /><p>Plataforma Acadêmica de Eventos e Pesquisa</p></footer>
  </div>}</div>;
}
