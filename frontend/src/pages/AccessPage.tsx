import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { accessAreas } from '../auth/access';
import '../access.css';

export function AccessPage() {
  return <main className="access-shell login-choice-page">
    <Brand login />
    <section className="login-choice" aria-labelledby="login-choice-title">
      <header><h1 id="login-choice-title">Como deseja fazer login?</h1><p>Escolha o acesso à sua conta.</p></header>
      <div className="login-choice__options">
        <article><h2>Usuário</h2><p>Inscreva-se em eventos e acompanhe suas inscrições e certificados.</p><Link className="primary-button" to={accessAreas.participant.login}>Fazer login como usuário</Link></article>
        <article><h2>Organização</h2><p>Gerencie seus eventos, atividades, participantes e certificados.</p><Link className="primary-button" to={accessAreas.organization.login}>Fazer login como organização</Link></article>
      </div>
      <Link className="login-choice__back" to="/">Voltar à página inicial</Link>
    </section>
  </main>;
}
