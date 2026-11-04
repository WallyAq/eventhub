import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Brand } from './Brand';
import { useAuth } from '../auth/AuthContext';
import type { AccessArea } from '../auth/access';
import './app-layout.css';

export function AppLayout({ area = 'participant', children }: { area?: AccessArea; children: ReactNode }) {
  const { session, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuContainer = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (confirm) dialog.current?.showModal(); else dialog.current?.close();
  }, [confirm]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => { if (!menuContainer.current?.contains(event.target as Node)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menu]);
  const initials = (session?.user.name || '').trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase();
  return <div className={'application-shell' + (area === 'participant' ? ' participant-shell' : '')}>
    <header className="topbar">
      <Brand to={area === 'participant' ? '/eventos' : '/organizacao/eventos'} />
      <nav className="topnav" aria-label="Navegação principal">
        {area === 'participant' ? <><NavLink to="/eventos">Página Inicial</NavLink><NavLink to="/minhas-inscricoes">Minhas Inscrições</NavLink></> :
          <><NavLink to="/organizacao/eventos">Gerenciar Eventos</NavLink><NavLink to="/organizacoes">Organizações e equipe</NavLink><NavLink to="/organizacao/perfil">Meu Perfil</NavLink></>}
      </nav>
      <div className="account-menu" ref={menuContainer}>
        <button ref={trigger} type="button" className="account-trigger" aria-label="Menu da conta" aria-expanded={menu} onClick={() => setMenu(value => !value)}><span className="avatar">{initials}</span><span>{session?.user.name}</span></button>
        {menu && <div className="account-popover"><div className="popover-identity"><span className="avatar">{initials}</span><div><strong>{session?.user.name}</strong><small>{session?.user.email}</small></div></div><Link onClick={() => setMenu(false)} to={area === 'organization' ? '/organizacao/perfil' : '/perfil'}><img src="/figma/e12a2.svg" alt="" />Meu perfil</Link><Link onClick={() => setMenu(false)} to="/acesso"><img src="/figma/b47cd.svg" alt="" />Trocar área de acesso</Link><button type="button" onClick={() => { setMenu(false); setConfirm(true); }}><img src="/figma/c3fac.svg" alt="" />Sair</button></div>}
      </div>
    </header>
    {children}
    {area === 'participant' && <footer className="participant-footer"><div className="participant-footer__content"><Brand to="/eventos" /><p>Plataforma Acadêmica de Eventos e Pesquisa</p></div></footer>}
    <dialog ref={dialog} className="logout-dialog" aria-labelledby="logout-title" onCancel={event => { event.preventDefault(); setConfirm(false); }}>
      <button type="button" className="dialog-close" aria-label="Fechar janela" onClick={() => setConfirm(false)}><img src="/figma/79090.svg" alt="" /></button>
      <h2 id="logout-title">Deseja realmente sair?</h2><p>Você precisará fazer login novamente para acessar suas inscrições, certificados e gerenciar seus eventos salvos.</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setConfirm(false)}>Continuar conectado</button><button type="button" className="primary-button" onClick={() => { signOut(); setConfirm(false); navigate(area === 'organization' ? '/organizacao/login' : '/participante/login', { replace: true }); }}>Sim, sair</button></div>
    </dialog>
  </div>;
}

