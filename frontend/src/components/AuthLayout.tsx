import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { accessAreas } from '../auth/access';
import type { AccessArea } from '../auth/access';

export function AuthLayout({ children, area = 'participant' }: { children: ReactNode; area?: AccessArea }) {
  const access = accessAreas[area];
  return <div className="shell">
    <header>
      <Link className="brand" to="/">event<span>hub</span><span className="brand-dot">●</span></Link>
      <nav className="account-nav" aria-label="Navegação principal"><span className="area-label">Área de {access.label.toLowerCase()}</span><Link to="/acesso">Escolher acesso</Link></nav>
    </header>
    <main className="auth-main">
      <section className="intro">
        <span className="area-badge">{access.label}</span><br />
        <span className="eyebrow">{access.eyebrow}</span>
        <h1>{access.hero}</h1>
        <p>{access.heroDescription}</p>
      </section>
      {children}
    </main>
    <footer><span>EventHub · Projeto acadêmico UECE</span><span>Encontros. Ideias. Possibilidades.</span></footer>
  </div>;
}

