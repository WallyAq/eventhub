import { QrCheckInDialog } from '../../components/events/QrCheckInDialog';
import { CertificateSettings } from '../../components/events/CertificateSettings';
import { PublicEventInformation } from '../../components/events/PublicEventInformation';
import { RequiredMark } from '../../components/form/RequiredMark';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BusinessLayout, Feedback } from '../../components/Business';
import { OrganizerDialog } from '../../components/events/OrganizerDialog';
import { useAuth } from '../../auth/AuthContext';
import { api, date, money, statusLabel, useData } from '../../services/business';
import type { EventData, Registration } from '../../services/business';
import { errorMessage } from '../../services/identity';
import './organizer-event.css';

type ParticipantRegistration = Registration & { participant: { name: string; email: string } };
const tabs = [['inscricoes', 'Participantes e inscrições'], ['atividades', 'Atividades e check-in'], ['palestrantes', 'Professores e palestrantes'], ['configuracoes', 'Configurações do evento']] as const;

export function OrganizerEventPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') || 'inscricoes';
  const [notice, setNotice] = useState('');
  useEffect(() => { setNotice(''); }, [id]);
  const { data, loading, error, reload } = useData<{ event: EventData }>('/events/' + id + '?managed=true');
  return <BusinessLayout area="organization"><div className="organizer-event">
    <Link to="/organizacao/eventos">← Gerenciar eventos</Link>
    <Feedback loading={loading} error={error} />
    {notice && <p className="success" role="status">{notice}</p>}
    {!loading && !error && data && <>
      <header className="business-heading"><div><h1>{data.event.title}</h1><p>{data.event.organizationName} · {data.event.modality} · {date(data.event.startsAt)}</p><span className={'status-badge status-' + data.event.status}>{statusLabel[data.event.status]}</span></div><div className="organizer-actions"><Link className="secondary-button" to={'/organizacao/eventos/' + id + '/painel'}>Ver painel do evento</Link><Link className="secondary-button" to={'/organizacao/eventos/' + id}>Editar dados do evento</Link>{data.event.status === 'PUBLISHED' && <Link className="primary-button" to={'/organizacao/eventos/' + id + '/visualizar'}>Ver página do evento</Link>}</div></header>
      <nav className="organizer-tabs" aria-label="Gestão do evento">{tabs.map(([key, label]) => <button type="button" key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setParams({ aba: key })}>{label}</button>)}</nav>
      {tab === 'inscricoes' && <Registrations key={id} event={data.event} />}
      {tab === 'atividades' && <Activities event={data.event} />}
      {tab === 'palestrantes' && <Speakers event={data.event} />}
      {tab === 'configuracoes' && <Settings event={data.event} reload={reload} onNotice={setNotice} />}
      {!tabs.some(([key]) => key === tab) && <p>Selecione uma das abas para gerenciar o evento.</p>}
    </>}
  </div></BusinessLayout>;
}

async function download(path: string, token: string, filename: string) {
  const response = await fetch('/api' + path, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Não foi possível exportar as inscrições. Tente novamente.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Registrations({ event, checkIn = false, activityId = '' }: { event: EventData; checkIn?: boolean; activityId?: string }) {
  const { session } = useAuth();
  const [status, setStatus] = useState(''), [activity, setActivity] = useState(activityId), [page, setPage] = useState(1), [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failure, setFailure] = useState(''), [target, setTarget] = useState<ParticipantRegistration | null>(null);
  const filters = new URLSearchParams({ ...(status ? { status } : {}), ...(activity ? { activityId: activity } : {}) });
  const listing = useData<{ registrations: ParticipantRegistration[]; total: number }>('/organizer/events/' + event.id + '/registrations?' + filters + '&limit=25&page=' + page);
  async function act(registration: ParticipantRegistration) {
    if (!session || busy) return;
    setBusy(true); setFailure(''); setMessage('');
    try {
      if (checkIn) await api('/attendance/check-ins', session.token, 'POST', { registrationId: registration.id });
      else await api('/organizer/registrations/' + registration.id + '/cancel', session.token, 'POST', {});
      setMessage(checkIn ? 'Presença registrada com sucesso.' : 'Inscrição cancelada.'); setTarget(null); listing.reload();
    } catch (error) { setFailure(errorMessage(error)); } finally { setBusy(false); }
  }
  const rows = (listing.data?.registrations || []).filter(row => (row.participant.name + ' ' + row.participant.email).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="business-card organizer-panel">
    <div className="section-toolbar"><div><h2>{checkIn ? 'Lista de presença' : 'Inscrições do evento'}</h2><p>{listing.data?.total ?? 0} inscrições · {checkIn ? 'O check-in segue o período permitido para cada atividade.' : 'Acompanhe participantes e pagamentos.'}</p></div>{!checkIn && <button className="primary-button" disabled={busy || !session} onClick={async () => { if (!session) return; setBusy(true); setFailure(''); try { await download('/organizer/events/' + event.id + '/registrations/export.csv?' + filters, session.token, 'inscricoes-' + event.id + '.csv'); } catch (error) { setFailure(errorMessage(error)); } finally { setBusy(false); } }}>Exportar CSV</button>}</div>
    <div className="organizer-filters"><input aria-label="Buscar participantes nesta página" placeholder="Buscar nome ou e-mail nesta página" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filtrar por atividade" value={activity} onChange={e => { setActivity(e.target.value); setPage(1); }}><option value="">Todas as atividades</option>{event.activities.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select aria-label="Filtrar por status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todos os status</option>{['CONFIRMED', 'PENDING_PAYMENT', 'WAITLISTED', 'CANCELLED', 'EXPIRED'].map(value => <option key={value} value={value}>{statusLabel[value]}</option>)}</select></div>
    <Feedback loading={listing.loading} error={listing.error || failure} />{message && <p className="success" role="status">{message}</p>}
    {!listing.loading && !listing.error && <><div className="organizer-table-wrap"><table className="organizer-table"><thead><tr><th>Participante</th><th>Atividade</th><th>Status</th><th>{checkIn ? 'Inscrição' : 'Valor'}</th><th>Ações</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.participant.name}</strong><small>{row.participant.email}</small></td><td>{row.activity.title}</td><td><span className={'status-badge status-' + row.status}>{statusLabel[row.status]}</span></td><td>{checkIn ? row.id : money(row.priceCents)}</td><td>{checkIn ? <button className="secondary-button" disabled={busy || row.status !== 'CONFIRMED' || event.status !== 'PUBLISHED'} onClick={() => setTarget(row)}>Registrar presença</button> : ['CONFIRMED', 'PENDING_PAYMENT', 'WAITLISTED'].includes(row.status) && event.status === 'PUBLISHED' && <button className="secondary-button" disabled={busy} onClick={() => setTarget(row)}>Cancelar inscrição</button>}</td></tr>)}</tbody></table></div>{!rows.length && <div className="empty-state"><h3>Nenhuma inscrição encontrada</h3><p>Revise os filtros ou aguarde novas inscrições.</p></div>}<div className="pagination"><span>Página {page} de {Math.max(1, Math.ceil((listing.data?.total || 0) / 25))}</span><button className="secondary-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><button className="secondary-button" disabled={page * 25 >= (listing.data?.total || 0)} onClick={() => setPage(page + 1)}>Próxima</button></div></>}
    {target && (checkIn ? <PresenceDialog registration={target} busy={busy} error={failure} onClose={() => { if (!busy) setTarget(null); }} onConfirm={() => act(target)} /> : <OrganizerDialog title="Cancelar inscrição?" description="Esta ação cancela a reserva e pode liberar a vaga para a lista de espera." onClose={() => { if (!busy) setTarget(null); }} onSubmit={() => act(target)} footer={<><button type="button" className="secondary-button" disabled={busy} onClick={() => setTarget(null)}>Voltar</button><button className="danger-button" disabled={busy}>{busy ? 'Processando…' : 'Confirmar cancelamento'}</button></>}><div className="organizer-confirm"><h3>{target.participant.name}</h3><p>{target.participant.email}</p><p>{target.activity.title}</p><small>{target.id}</small><Feedback loading={false} error={failure} /></div></OrganizerDialog>)}
  </section>;
}

function PresenceDialog({ registration, busy, error, onClose, onConfirm }: { registration: ParticipantRegistration; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  const presence = useData<{ attendance: { checkedInAt: string } | null }>('/attendance/registrations/' + registration.id);
  return <OrganizerDialog title="Validação de presença" description="Confira a inscrição e a presença do participante." onClose={onClose} onSubmit={() => { if (!presence.loading && !presence.error && !presence.data?.attendance) onConfirm(); }} footer={<><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Voltar</button><button className="primary-button" disabled={busy || presence.loading || !!presence.error || !!presence.data?.attendance}>{busy ? 'Processando…' : 'Confirmar presença'}</button></>}><div className="organizer-confirm"><h3>{registration.participant.name}</h3><p>{registration.participant.email}</p><p>{registration.activity.title}</p><small>{registration.id}</small><Feedback loading={presence.loading} error={presence.error || error} />{presence.data?.attendance && <p className="success" role="status">Presença já registrada em {date(presence.data.attendance.checkedInAt)}.</p>}</div></OrganizerDialog>;
}

function Activities({ event }: { event: EventData }) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(''), [scanner, setScanner] = useState('');
  return <><section className="business-card organizer-panel"><div className="section-toolbar"><div><h2>Atividades e check-in</h2><p>Programação e controle de vagas por atividade.</p></div><Link className="secondary-button" to={'/organizacao/eventos/' + event.id}>Editar programação</Link></div><input aria-label="Buscar atividades" placeholder="Buscar atividade ou responsável" value={query} onChange={e => setQuery(e.target.value)} />{event.activities.filter(item => (item.title + item.responsible).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item => <article className="organizer-list-row" key={item.id}><div><h3>{item.title}</h3><p>{date(item.startsAt)} — {date(item.endsAt)}</p><p>{item.responsible} · {item.location}</p><small>{item.capacity} vagas · {money(item.priceCents)} · {item.kind || 'Atividade'}</small></div><div className="organizer-actions"><button className="primary-button" onClick={() => setSelected(item.id)}>Lista de presença</button><button className="secondary-button" disabled={event.status !== 'PUBLISHED'} onClick={() => setScanner(item.id)}>Ler QR Code</button></div></article>)}</section>{selected && <Registrations key={selected} event={event} checkIn activityId={selected} />}{scanner && <QrCheckInDialog key={scanner} event={event} activityId={scanner} onClose={() => setScanner('')} />}</>;
}

function Speakers({ event }: { event: EventData }) {
  const [query, setQuery] = useState('');
  const items = event.speakers.filter(item => (item.name + item.institution).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="business-card organizer-panel"><div className="section-toolbar"><div><h2>Professores e palestrantes</h2><p>Corpo docente e convidados do evento.</p></div><Link className="secondary-button" to={'/organizacao/eventos/' + event.id}>Editar palestrantes</Link></div><input aria-label="Buscar palestrantes" placeholder="Buscar nome ou instituição" value={query} onChange={e => setQuery(e.target.value)} />{items.map((item, index) => <article key={item.id || index} className="organizer-list-row"><span className="organizer-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span><div><h3>{item.name}</h3><p>{item.degree} · {item.institution}</p><p>{item.email}</p><small>{item.biography}</small></div></article>)}{!items.length && <div className="empty-state">Nenhum palestrante encontrado.</div>}</section>;
}

function Settings({ event, reload, onNotice }: { event: EventData; reload: () => void; onNotice: (message: string) => void }) {
  const { session } = useAuth();
  const [confirm, setConfirm] = useState(false), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function cancel() {
    if (!session || busy || title !== event.title) return;
    setBusy(true); setError('');
    try { await api('/events/' + event.id + '/cancel', session.token, 'POST', {}); setConfirm(false); reload(); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="organizer-settings"><section className="business-card"><h2>Inscrições e lotação</h2><div className="organizer-setting-grid"><div><small>Estado do evento</small><p>{statusLabel[event.status]}</p></div><div><small>Capacidade das atividades</small><p>{event.activities.reduce((sum, item) => sum + item.capacity, 0)} vagas</p></div><div><small>Atividades com lista de espera</small><p>{event.activities.filter(item => item.waitlistEnabled !== false).length}</p></div></div><p>As vagas, os valores e a programação são definidos no rascunho e ficam fixos após a publicação.</p><Link className="secondary-button" to={'/organizacao/eventos/' + event.id}>Revisar dados e publicação</Link></section>
    <CertificateSettings key={event.id} event={event} />
    <PublicEventInformation key={'public-' + event.id} event={event} reload={reload} onNotice={onNotice} />
    <section className="business-card organizer-danger"><h2>Ações críticas</h2><div className="section-toolbar"><div><h3>Cancelar evento</h3><p>O cancelamento impede novas inscrições e inicia o cancelamento das reservas.</p></div><button className="danger-button" disabled={event.status === 'CANCELLED'} onClick={() => { setError(''); setTitle(''); setConfirm(true); }}>Cancelar evento</button></div></section>
    {confirm && <OrganizerDialog title="Cancelar evento?" description="Confira o impacto antes de continuar. Esta ação não pode ser desfeita." onClose={() => { if (!busy) setConfirm(false); }} onSubmit={cancel} footer={<><button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirm(false)}>Voltar</button><button className="danger-button" disabled={busy || title !== event.title}>{busy ? 'Cancelando…' : 'Sim, cancelar evento'}</button></>}><div className="organizer-confirm"><p>O cancelamento impede novas inscrições e enfileira avisos aos participantes inscritos. A entrega dos avisos ocorre em segundo plano.</p><label htmlFor="cancel-event-title">Para confirmar, digite: <strong>{event.title}</strong><RequiredMark /></label><input id="cancel-event-title" value={title} disabled={busy} onChange={e => setTitle(e.target.value)} required /><Feedback loading={false} error={error} /></div></OrganizerDialog>}
  </div>;
}
