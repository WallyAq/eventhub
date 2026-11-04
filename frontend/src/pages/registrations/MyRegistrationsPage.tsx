import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { BusinessLayout, Feedback, Icon } from '../../components/Business';
import { api, useData, date, money, statusLabel } from '../../services/business';
import type { Registration } from '../../services/business';
import { errorMessage } from '../../services/identity';
import './my-registrations.css';

const PAGE_SIZE = 6;
const ACTIVE = new Set<Registration['status']>(['PENDING_PAYMENT', 'CONFIRMED', 'WAITLISTED']);
const TABS = [
  { id: 'active', label: 'Inscrições Ativas' },
  { id: 'completed', label: 'Cursos Concluídos' },
  { id: 'closed', label: 'Encerradas' },
] as const;
type RegistrationTab = typeof TABS[number]['id'];
const TAB_STATUSES: Record<RegistrationTab, Registration['status'][]> = {
  active: ['PENDING_PAYMENT', 'CONFIRMED', 'WAITLISTED'], completed: ['CONFIRMED'], closed: ['CANCELLED', 'EXPIRED'],
};
function normalized(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim(); }
function tabFor(item: Registration, now: number): RegistrationTab {
  if (!ACTIVE.has(item.status)) return 'closed';
  const ends = new Date(item.activity.endsAt).getTime();
  return item.status === 'CONFIRMED' && Number.isFinite(ends) && ends <= now ? 'completed' : 'active';
}
function duration(item: Registration) {
  const minutes = Math.round((new Date(item.activity.endsAt).getTime() - new Date(item.activity.startsAt).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Duração a confirmar';
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}min` : ''} de duração` : `${minutes}min de duração`;
}
function secondsLeft(item: Registration, now: number) {
  if (!item.expiresAt) return 0;
  const expires = new Date(item.expiresAt).getTime();
  return Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - now) / 1000)) : 0;
}
function countdown(seconds: number) { return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }
function pageNumbers(current: number, pages: number) {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const nearby = current <= 3 ? [1, 2, 3] : current >= pages - 2 ? [pages - 2, pages - 1, pages] : [current - 1, current, current + 1];
  return [...new Set([1, ...nearby, pages])].sort((left, right) => left - right);
}

export function MyRegistrationsPage() {
  const { session } = useAuth();
  const { data, error, loading, reload } = useData<{ registrations: Registration[] }>('/registrations');
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1);
  const [tab, setTab] = useState<RegistrationTab>('active'), [now, setNow] = useState(Date.now());
  const [saved, setSaved] = useState<Record<string, Registration>>({});
  const [cancelTarget, setCancelTarget] = useState<Registration | null>(null), [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState(''), [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), lastFocused = useRef<HTMLElement | null>(null), inFlight = useRef(false);
  const tabButtons = useRef<Partial<Record<RegistrationTab, HTMLButtonElement | null>>>({});
  const reloadRef = useRef(reload); reloadRef.current = reload;
  const registrations = (data?.registrations || []).map(item => saved[item.id] || item);
  const hasPending = registrations.some(item => item.status === 'PENDING_PAYMENT');
  const shouldPoll = hasPending || registrations.some(item => item.status === 'WAITLISTED');
  const nextActivityEnd = Math.min(...registrations.filter(item => item.status === 'CONFIRMED').map(item => new Date(item.activity.endsAt).getTime()).filter(ends => ends > now));

  useEffect(() => {
    if (!hasPending) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasPending]);
  useEffect(() => {
    if (!Number.isFinite(nextActivityEnd)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, nextActivityEnd - Date.now()), 2147483647));
    return () => clearTimeout(timer);
  }, [nextActivityEnd, now]);
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = setInterval(() => reloadRef.current(), 15000);
    return () => clearInterval(timer);
  }, [shouldPoll]);
  useEffect(() => {
    const element = dialog.current;
    if (cancelTarget && element && !element.open) {
      lastFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    } else if (!cancelTarget && element?.open) {
      element.close();
      if (lastFocused.current?.isConnected) lastFocused.current.focus();
      else tabButtons.current[tab]?.focus();
    }
  }, [cancelTarget?.id]);

  function changeTab(next: RegistrationTab) { setTab(next); setStatus(''); setPage(1); }
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : -1;
    if (next < 0) return;
    event.preventDefault(); changeTab(TABS[next].id); tabButtons.current[TABS[next].id]?.focus();
  }
  function closeCancel() {
    if (inFlight.current) return;
    setCancelTarget(null); setCancelError('');
  }
  async function confirmCancel() {
    if (!session || !cancelTarget || inFlight.current) return;
    inFlight.current = true; setBusy(true); setCancelError(''); setNotice('');
    try {
      const result = await api<{ registration: Registration }>('/registrations/' + cancelTarget.id + '/cancel', session.token, 'POST', {});
      // Cancellation is terminal. Keep the returned record over any older in-flight list response.
      setSaved(previous => ({ ...previous, [result.registration.id]: result.registration }));
      setNotice(result.registration.status === 'CANCELLED' ? 'Inscrição cancelada. Consulte a aba Encerradas para ver os detalhes.' : 'Estado da inscrição atualizado.');
      setCancelTarget(null); reloadRef.current();
    } catch (error) { setCancelError(errorMessage(error)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const counts = { active: 0, completed: 0, closed: 0 };
  registrations.forEach(item => { counts[tabFor(item, now)]++; });
  const filtered = registrations.filter(item => tabFor(item, now) === tab && (!status || item.status === status) && normalized(item.eventTitle + ' ' + item.activity.title + ' ' + item.activity.location).includes(normalized(query)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), numbers = pageNumbers(current, pages);
  const sectionTitle = tab === 'completed' ? 'Histórico de Cursos e Eventos Encerrados' : tab === 'closed' ? 'Inscrições Canceladas e Reservas Expiradas' : 'Ingressos e Inscrições';

  return <BusinessLayout><div className="my-registrations">
    <div className="business-heading"><div><h1>Minhas Inscrições</h1><p>Gerencie seus ingressos e acompanhe suas atividades e pagamentos.</p></div><Link className="secondary-button" to="/eventos">Explorar eventos</Link></div>
    <Feedback loading={loading && !data} error={error} />
    {notice && <p className="success my-registration-notice" role="status">{notice}</p>}
    {error && <button type="button" className="secondary-button" onClick={reload}>Tentar novamente</button>}
    {data && <>
      <div className="my-registration-tabs" role="tablist" aria-label="Tipos de inscrição">{TABS.map((item, index) => <button key={item.id} ref={element => { tabButtons.current[item.id] = element; }} id={'registration-tab-' + item.id} role="tab" type="button" aria-selected={tab === item.id} aria-controls="registrations-panel" tabIndex={tab === item.id ? 0 : -1} onClick={() => changeTab(item.id)} onKeyDown={event => navigateTabs(event, index)}>{item.label}<span>{counts[item.id]}</span></button>)}</div>
      <section key={tab} id="registrations-panel" role="tabpanel" aria-labelledby={'registration-tab-' + tab} tabIndex={0}>
        <div className="filter-bar"><div className="search-field"><Icon file="3f6b7" /><input aria-label="Buscar inscrições" placeholder="Buscar por evento, atividade ou local..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><select aria-label="Status da inscrição" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{TAB_STATUSES[tab].map(value => <option key={value} value={value}>{statusLabel[value]}</option>)}</select></div>
        <div className="my-registration-section-heading"><h2>{sectionTitle}</h2><p>{tab === 'completed' ? 'Atividades cujo período já terminou. Certificados ainda não estão disponíveis.' : tab === 'closed' ? 'Consulte os registros e os detalhes das inscrições encerradas.' : 'Consulte seu comprovante e os detalhes da programação.'}</p></div>
        <div className="my-registrations-grid">{visible.map(item => {
          const seconds = secondsLeft(item, now), pending = item.status === 'PENDING_PAYMENT', payable = pending && seconds > 0;
          const completed = tab === 'completed', confirmed = item.status === 'CONFIRMED' && !completed;
          const programUrl = '/eventos/' + item.eventId + '#atividades';
          return <article className={'my-registration-card' + (completed ? ' my-registration-completed' : '')} key={item.id}>
            <div className="my-registration-content">
              <div className="my-registration-title"><h3>{item.eventTitle}</h3><span className={'status-badge status-' + item.status}>{completed ? 'Atividade encerrada' : statusLabel[item.status]}</span></div>
              <div className="my-registration-meta"><p><Icon file="46b9b" /><span>{completed ? <>Encerrada em {date(item.activity.endsAt)}</> : <>{date(item.activity.startsAt)}<br />Até {date(item.activity.endsAt)}</>}</span></p><p><Icon file="ed882" /><span>{item.activity.location || 'Local a confirmar'}</span></p><p><Icon file="9264c" /><span>{duration(item)}</span></p>{item.activity.responsible && <p><Icon file="a7cf1" /><span>Responsável: {item.activity.responsible}</span></p>}<p><span className="my-registration-value-label">Valor:</span><strong>{item.priceCents === 0 ? 'Gratuito' : money(item.priceCents)}</strong></p></div>
              <div className="my-registration-activity"><strong>Atividade inscrita:</strong><span>{item.activity.title}</span></div>
              {pending && item.expiresAt && <div className="my-registration-reservation"><p role="timer" aria-live="off"><Icon file="9264c" />Reserva: <strong>{countdown(seconds)} min</strong></p><small>{seconds > 0 ? <>Pagamento até {date(item.expiresAt)}.</> : 'Prazo encerrado. Aguardando atualização da inscrição.'}</small></div>}
              {item.status === 'WAITLISTED' && <p className="my-registration-note">Acompanhe a liberação de vagas para esta atividade.</p>}
              {!completed && <div className="my-registration-actions">{ACTIVE.has(item.status) && <button type="button" className="secondary-button my-registration-cancel" onClick={() => { setCancelError(''); setCancelTarget(item); }}>Cancelar inscrição</button>}<Link className="secondary-button" to={programUrl}>Detalhes da Programação</Link></div>}
            </div>
            <aside className={'my-registration-side' + (confirmed ? ' my-registration-credential' : '')} aria-label={confirmed ? 'Comprovante digital' : 'Ações da inscrição'}>
              {confirmed ? <><span className="my-registration-credential-label">Comprovante digital</span><span className="my-registration-credential-status">Inscrição confirmada</span><div className="my-registration-credential-id"><small>Identificação da inscrição</small><code>{item.id}</code></div><p className="my-registration-participant"><strong>{session?.user.name}</strong><span>Participante inscrito</span></p><Link className="primary-button" to={'/inscricoes/' + item.id}>Ver ingresso</Link></> : completed ? <><Link className="secondary-button" to={programUrl}>Ver Programação</Link><button type="button" className="primary-button" disabled title="Certificados ainda não estão disponíveis">Baixar Certificado (PDF)</button><Link className="text-button" to={'/inscricoes/' + item.id}>Ver comprovante</Link></> : <Link className={payable ? 'primary-button' : 'secondary-button'} to={(payable ? '/pagamento/' : '/inscricoes/') + item.id}>{payable ? 'Continuar pagamento' : 'Ver inscrição'}</Link>}
            </aside>
          </article>;
        })}</div>
        {!filtered.length && <section className="empty-state my-registrations-empty"><h2>{query || status ? 'Nenhuma inscrição encontrada' : !registrations.length ? 'Você ainda não possui inscrições' : tab === 'completed' ? 'Nenhuma atividade concluída' : tab === 'closed' ? 'Nenhuma inscrição encerrada' : 'Nenhuma inscrição ativa'}</h2><p>{query || status ? 'Nenhuma inscrição corresponde à busca e aos filtros selecionados nesta aba.' : tab === 'completed' && registrations.length ? 'Suas inscrições confirmadas aparecerão aqui após o término das atividades.' : tab === 'closed' && registrations.length ? 'As inscrições canceladas e as reservas expiradas aparecerão aqui.' : 'Explore os eventos disponíveis e escolha uma atividade para participar.'}</p>{query || status ? <button type="button" className="secondary-button" onClick={() => { setQuery(''); setStatus(''); setPage(1); }}>Limpar filtros</button> : <Link className="primary-button" to="/eventos">Explorar eventos disponíveis</Link>}</section>}
        {filtered.length > 0 && <div className="my-registrations-pagination"><p>Mostrando <strong>{(current - 1) * PAGE_SIZE + 1} a {Math.min(current * PAGE_SIZE, filtered.length)}</strong> de <strong>{filtered.length}</strong> inscrições</p>{pages > 1 && <nav aria-label="Páginas de inscrições"><button type="button" aria-label="Página anterior" disabled={current === 1} onClick={() => setPage(current - 1)}>‹</button>{numbers.map((number, index) => <span key={number}>{index > 0 && number - numbers[index - 1] > 1 && <span className="my-registrations-pagination-gap" aria-hidden="true">…</span>}<button type="button" aria-label={'Página ' + number} aria-current={number === current ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button></span>)}<button type="button" aria-label="Próxima página" disabled={current === pages} onClick={() => setPage(current + 1)}>›</button></nav>}</div>}
      </section>
    </>}
    <dialog ref={dialog} className="my-registration-cancel-dialog" aria-labelledby="cancel-registration-title" aria-describedby="cancel-registration-description" aria-busy={busy} onCancel={event => { event.preventDefault(); closeCancel(); }}>
      <h2 id="cancel-registration-title">Cancelar inscrição?</h2><p id="cancel-registration-description">A inscrição será encerrada e a disponibilidade da atividade será atualizada.</p>{cancelTarget && <p className="my-registration-cancel-target"><strong>{cancelTarget.activity.title}</strong><span>{cancelTarget.eventTitle}</span></p>}{cancelError && <p className="error" role="alert">{cancelError}</p>}<div className="my-registration-cancel-dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={closeCancel}>Voltar</button><button type="button" className="danger-button" disabled={busy} onClick={confirmCancel}>{busy ? 'Cancelando…' : 'Confirmar cancelamento'}</button></div>
    </dialog>
  </div></BusinessLayout>;
}
