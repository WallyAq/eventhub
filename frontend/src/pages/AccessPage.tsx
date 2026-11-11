import { Link, Navigate } from 'react-router-dom';
import { accessAreas, accountDestination } from '../auth/access';
import { useAuth } from '../auth/AuthContext';
import '../access.css';

export function AccessPage({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const register = mode === 'register';
  const { session } = useAuth();
  if (session) return <Navigate to={accountDestination(session.user.role)} replace />;
  return <main className="access-shell login-choice-page" data-figma-node={register ? undefined : '2114:8611'}><section className="login-choice" aria-labelledby="login-choice-title">
    <header><p className="login-choice__eyebrow">{register ? 'CRIE SUA CONTA NO EVENTHUB' : 'BEM-VINDO AO EVENTHUB'}</p><h1 id="login-choice-title">{register ? 'Como você quer se cadastrar?' : 'Como você quer entrar?'}</h1><p>{register ? 'Escolha seu perfil para começar.' : 'Escolha seu espaço para continuar.'}</p></header>
    <div className="login-choice__options">
      <article><span className="login-choice__number">01</span><p className="login-choice__role">PARA QUEM PARTICIPA</p><h2>Sou participante</h2><p className="login-choice__description">{register ? 'Crie sua conta para se inscrever em eventos, acompanhar atividades e acessar seus certificados.' : 'Acesse sua conta pessoal e prepare-se para novas experiências e conexões.'}</p><Link className="primary-button" to={register ? accessAreas.participant.register : accessAreas.participant.login}>{register ? 'Cadastrar como participante' : 'Entrar como participante'}<img src="/figma/official/e2ee0.svg" alt="" /></Link><Link className="login-choice__register" to={register ? accessAreas.participant.login : accessAreas.participant.register}>{register ? 'Já tenho conta de participante' : 'Criar conta de participante'}</Link></article>
      <article><span className="login-choice__number">02</span><p className="login-choice__role">PARA QUEM ORGANIZA</p><h2>Sou organização</h2><p className="login-choice__description">{register ? 'Cadastre sua instituição para organizar eventos, gerenciar inscrições e emitir certificados.' : 'Acesse sua instituição e os eventos sob sua responsabilidade.'}</p><Link className="primary-button" to={register ? accessAreas.organization.register : accessAreas.organization.login}>{register ? 'Cadastrar organização' : 'Entrar na área da organização'}<img src="/figma/official/e2ee0.svg" alt="" /></Link><Link className="login-choice__register" to={register ? accessAreas.organization.login : accessAreas.organization.register}>{register ? 'Já tenho conta de organização' : 'Cadastrar responsável e começar'}</Link></article>
    </div>
    <p className="login-choice__note">Cada conta possui um único perfil: participante ou organizador. O perfil e a instituição são validados pelo servidor ao entrar.</p>
    <Link className="login-choice__back" to="/">Voltar à página inicial</Link>
  </section></main>;
}
