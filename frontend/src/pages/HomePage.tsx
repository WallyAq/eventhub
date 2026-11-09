import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import './home.css';

export function HomePage() {
  return <div className="home-page">
    <header className="home-nav"><Brand /><nav aria-label="Navegação do EventHub"><a href="#como-funciona">Como funciona</a><Link to="/acesso">Fazer login <span aria-hidden="true">↗</span></Link></nav></header>
    <main>
      <section className="home-hero"><p className="home-eyebrow">ENCONTROS QUE TRANSFORMAM IDEIAS</p><h1>Seu evento acadêmico<br /><em>do início ao fim.</em></h1><p>Da primeira inscrição ao último certificado.<br />Um só lugar para reunir pessoas e compartilhar conhecimento.</p><div className="home-actions"><Link className="home-cta" to="/organizacao/cadastro">Quero organizar um evento <span aria-hidden="true">↗</span></Link><Link className="home-secondary" to="/eventos">Explorar eventos</Link></div><p className="home-caption">Congressos, cursos, workshops e muito mais.</p>
        <div className="home-showcase" aria-label="Ilustração das etapas de um evento no EventHub">
          <article className="home-poster"><span>CONEXÕES · CIÊNCIA · FUTURO</span><div><small>O conhecimento<br />acontece no encontro.</small><strong>Novas ideias.<br />Grandes conexões.</strong></div><span>EVENTHUB / EVENTOS ACADÊMICOS</span></article>
          <article className="home-ticket"><div className="home-ticket-top"><span className="home-ticket-dot" /><span>EventHub</span><small>PRÉVIA ILUSTRATIVA</small></div><div className="home-ticket-heading"><span>SEU PRÓXIMO ENCONTRO</span><h2>Conhecimento<br />sem fronteiras.</h2></div><div className="home-ticket-body"><p><span>01</span> Encontre seu evento</p><p><span>02</span> Garanta sua inscrição</p><p><span>03</span> Participe e conecte-se</p><div className="home-ticket-code" aria-hidden="true">▥ ▥ ▥ ▥ ▥ ▥ ▥ ▥</div><strong>Da inscrição ao certificado.</strong></div></article>
          <figure className="home-photo"><div className="home-photo-image"><img src="/figma/88b7c.png" width="512" height="279" alt="Palestra de computação em um auditório" /></div><figcaption>O próximo grande encontro<br /><strong>começa com você.</strong></figcaption></figure>
          <span className="home-float home-float-one">✦ Mais conexões</span><span className="home-float home-float-two">✓ Tudo em um só lugar</span>
        </div>
      </section>
      <section className="home-steps" id="como-funciona"><div><p className="home-eyebrow">SIMPLES PARA QUEM ORGANIZA</p><h2>Você cuida das ideias.<br />O EventHub conecta as etapas.</h2></div><ol><li><span>01</span><h3>Prepare seu evento</h3><p>Monte a programação, convide palestrantes e defina vagas e categorias.</p></li><li><span>02</span><h3>Receba os participantes</h3><p>Publique, acompanhe inscrições e faça check-in por QR Code.</p></li><li><span>03</span><h3>Reconheça cada encontro</h3><p>Emita certificados e acompanhe os indicadores da sua organização.</p></li></ol><Link className="home-secondary" to="/acesso">Acessar minha conta <span aria-hidden="true">→</span></Link></section>
    </main><footer className="home-footer"><Brand /><p>Plataforma Acadêmica de Eventos e Pesquisa</p><Link to="/diagnostico">Estado da plataforma</Link></footer>
  </div>;
}
