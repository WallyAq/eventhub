import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import './home.css';

const assets = '/figma/official/';

export function HomePage() {
  return <div className="home-page" data-figma-node="2167:1335">
    <header className="home-nav"><Brand design="white" /><nav aria-label="Navegação do EventHub"><Link to="/acesso">Entrar</Link><Link to="/cadastro">Criar conta</Link></nav></header>
    <main className="home-hero">
      <div className="home-copy"><div className="home-announcement-space" aria-hidden="true" /><h1><span>Seu evento acadêmico</span><em>do início ao fim.</em></h1><p>Centralize inscrições em workshops, credenciamento por QR Code e emissão de certificados acadêmicos em uma experiência direta para participantes e instituições.</p><div className="home-actions"><Link className="home-cta" to="/cadastro">Cadastre-se, é gratuito</Link><div className="home-rating"><span className="home-stars" aria-label="5 estrelas">{Array.from({length:5}, (_, index) => <img key={index} src={assets + '4a199.svg'} alt="" />)}</span><strong>4.9</strong><span>de 1.400+ avaliações de congressistas</span></div></div></div>
      <div className="home-showcase-slot"><div className="home-showcase" role="img" aria-label="Prévia ilustrativa de um evento, com inscrição e credencial digital">
        <article className="home-photo-card home-photo-card--left"><div className="home-photo-source"><img src={assets + 'df53d.png'} alt="" /></div><img className="home-photo-overlay" src={assets + 'cc1ce.png'} alt="" /><div className="home-photo-caption"><strong>AUDITÓRIO PRINCIPAL</strong><span>Abertura e palestras magnas</span></div></article>
        <article className="home-photo-card home-photo-card--right"><div className="home-photo-source"><img src={assets + 'c2a66.png'} alt="" /></div><img className="home-photo-overlay" src={assets + 'f07f7.png'} alt="" /><div className="home-photo-caption"><strong>SALAS TEMÁTICAS</strong><span>Apresentação de artigos e pôsteres</span></div></article>
        <article className="home-phone"><div className="home-phone-screen"><div className="home-phone-camera" /><header><small>Hoje, 09:00 BRT</small><h2>Simpósio Tech 2026</h2></header><div className="home-phone-value"><div><small>LOTE ACADÊMICO</small><strong>R$ 120,00</strong></div><span><i /></span></div><div className="home-phone-people">{[['MS','Maya Silva'],['JR','Ramsés Rocha'],['SL','Sam Lins']].map(([initials,name]) => <div className="home-phone-person" key={initials}><span className="home-phone-person-name"><b>{initials}</b><span>{name}</span></span><span className="home-phone-person-payment"><strong>R$ 120</strong><small>Pago</small></span></div>)}</div><span className="home-phone-qr">Ver QR Code de Acesso</span></div></article>
        <div className="home-presence"><span>MA</span><div><strong>Maya confirmou presença</strong><small>Workshop UX e Pesquisa</small></div></div>
        <div className="home-registration-badge"><strong>Inscrição</strong><span>ABERTAS!</span></div>
        <div className="home-credential"><img src={assets + '3c627.svg'} alt="" /><div><strong>Credencial Emitida</strong><small>QR Code pronto para acesso</small></div></div>
      </div></div>
    </main>
    <footer className="home-footer"><Brand design="white" symbol="0df80.svg" /><p>Plataforma Acadêmica de Eventos e Pesquisa</p></footer>
  </div>;
}