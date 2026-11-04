import { Link } from 'react-router-dom';
import { accessAreas } from '../auth/access';
import { Brand } from '../components/Brand';

export function AccessPage() {
  return <div className="shell access-shell">
    <header><Brand /><span className="environment">Eventos acadêmicos e profissionais</span></header>
    <main className="access-main">
      <section className="access-intro"><span className="eyebrow">BEM-VINDO AO EVENTHUB</span><h1>Como você quer entrar?</h1><p>Escolha seu espaço para continuar.</p></section>
      <div className="access-options">
        <section className="access-card" aria-labelledby="participant-access"><span className="access-number" aria-hidden="true">01</span><span className="eyebrow">PARA QUEM PARTICIPA</span><h2 id="participant-access">Sou participante</h2><p>Acesse sua conta pessoal e prepare-se para novas experiências e conexões.</p><Link className="access-action" to={accessAreas.participant.login}>Entrar como participante <span aria-hidden="true">↗</span></Link><Link className="access-register" to={accessAreas.participant.register}>Criar conta de participante</Link></section>
        <section className="access-card organization-access-card" aria-labelledby="organization-access"><span className="access-number" aria-hidden="true">02</span><span className="eyebrow">PARA QUEM ORGANIZA</span><h2 id="organization-access">Sou organização</h2><p>Acesse suas organizações, gerencie seus dados e reúna sua equipe de organizadores.</p><Link className="access-action" to={accessAreas.organization.login}>Entrar na área da organização <span aria-hidden="true">↗</span></Link><Link className="access-register" to={accessAreas.organization.register}>Cadastrar responsável e começar</Link></section>
      </div>
      <p className="access-note">Você pode participar de eventos e organizar encontros com a mesma conta pessoal. O acesso às organizações depende do seu vínculo com cada equipe.</p>
    </main>
    <footer><span>EventHub · Projeto acadêmico UECE</span><Link to="/diagnostico">Estado da plataforma</Link></footer>
  </div>;
}
