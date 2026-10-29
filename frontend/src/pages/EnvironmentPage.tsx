import { useEffect, useState } from 'react';
import { getPlatformStatus } from '../services/api';
import type { PlatformStatus } from '../types/status';
import { Link } from 'react-router-dom';

const labels: Record<string, string> = {
  identity: 'Identidade e acesso', events: 'Eventos e programação',
  registrations: 'Inscrições e reservas', payments: 'Pagamentos',
  notifications: 'Notificações',
};

export function EnvironmentPage() {
  const [data, setData] = useState<PlatformStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    setLoading(true);
    setError('');
    try { setData(await getPlatformStatus()); }
    catch { setData(null); setError('Não foi possível consultar os serviços. Verifique se o ambiente está em execução e tente novamente.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return (
    <div className="shell">
      <header><Link className="brand" to="/">event<span>hub</span><span className="brand-dot">●</span></Link><nav className="account-nav"><Link to="/perfil">Minha conta</Link><span className="environment">Ambiente local · UECE</span></nav></header>
      <main>
        <section className="intro">
          <span className="eyebrow">CONEXÕES QUE MOVEM O CONHECIMENTO</span>
          <h1>Grandes encontros<br />começam aqui.</h1>
          <p>Um espaço para descobrir eventos, compartilhar ideias e fazer parte de novas experiências acadêmicas e profissionais.</p>
          <div className="milestone"><span className="step">02</span><div><strong>A plataforma está evoluindo</strong><p>Cadastro e acesso de participantes estão disponíveis. Eventos e inscrições serão as próximas entregas.</p></div></div>
        </section>
        <section className="status-panel" aria-labelledby="status-title">
          <div className="panel-top"><span className="eyebrow">PRIMEIRA ENTREGA</span><span className="tag">Infraestrutura</span></div>
          <h2 id="status-title">Tudo começa com uma boa base.</h2>
          <p>Conectividade das aplicações e de seus bancos de dados.</p>
          <div aria-live="polite" aria-busy={loading}>
            {error && <p className="error" role="alert">{error}</p>}
            {!data && !error && <p>Consultando o ambiente…</p>}
            {data?.services.map(service => <div className="service" key={service.name}><span>{labels[service.name] || service.name}</span><span className={'state ' + service.status}><i />{service.status === 'ready' ? 'Disponível' : 'Indisponível'}</span></div>)}
          </div>
          <button onClick={() => void refresh()} disabled={loading}>{loading ? 'Consultando…' : 'Verificar novamente'}<span aria-hidden="true">↗</span></button>
          <p className="note">Este painel verifica a infraestrutura. As funcionalidades de negócio ainda estão em desenvolvimento.</p>
        </section>
      </main>
      <footer><span>EventHub · Projeto acadêmico</span><span>Encontros. Ideias. Possibilidades.</span></footer>
    </div>
  );
}

