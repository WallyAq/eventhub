import { formatInput } from '../../components/form/MaskedInput';
import { CheckInCode } from '../../components/events/CheckInCode';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { BusinessLayout, Feedback, Icon } from '../../components/Business';
import { api, date, money, reserve, statusLabel } from '../../services/business';
import type { Activity, EventData, Payment, Registration } from '../../services/business';
import { errorMessage } from '../../services/identity';
import { useEventAvailability } from '../../services/availability';
import { ActivitySeats } from '../../components/events/ActivitySeats';
import { activeRegistration, registrationAction, useEventRegistrations } from '../../services/eventRegistrations';
import { ExistingRegistrationNotice } from '../../components/events/ExistingRegistrationNotice';
import { RequiredMark } from '../../components/form/RequiredMark';
import './checkout.css';

type Step = 1 | 2 | 3 | 4;
type Outcome = 'APPROVED' | 'DECLINED' | 'EXPIRED';
type ReservationState = { registration: Registration; payment?: Payment | null; warning?: string };
function stored(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } }
function remember(key: string, value: string | null) {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* A chave também permanece em memória nesta aba. */ }
}
function maskedCpf(value?: string | null) {
  const digits = value?.replace(/\D/g, '') || '';
  return digits.length === 11 ? `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}` : 'Não informado';
}
function duration(activity: Activity) {
  const hours = (new Date(activity.endsAt).getTime() - new Date(activity.startsAt).getTime()) / 3600000;
  return Number.isFinite(hours) && hours > 0 ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours)}h de duração` : 'Consulte a programação';
}
async function readReservation(token: string, id: string): Promise<ReservationState> {
  let { registration } = await api<{ registration: Registration }>('/registrations/' + id, token);
  if (!registration.priceCents) return { registration, payment: null };
  let payment: Payment | null;
  try {
    ({ payment } = await api<{ payment: Payment | null }>('/payments/' + id, token));
  } catch (error) { return { registration, warning: 'Não foi possível consultar o pagamento. ' + errorMessage(error) }; }
  // Mesmo que a leitura seguinte falhe, o pagamento conhecido bloqueia outro POST.
  if (payment) {
    try { ({ registration } = await api<{ registration: Registration }>('/registrations/' + id, token)); }
    catch (error) { return { registration, payment, warning: 'Pagamento consultado. Não foi possível atualizar a inscrição. ' + errorMessage(error) }; }
  }
  return { registration, payment };
}

export function CheckoutPage() {
  const { eventId, activityId, id } = useParams(), { session } = useAuth(), navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null), mounted = useRef(false), operation = useRef(false);
  const operationEpoch = useRef(0);
  const currentStatus = useRef<Registration['status'] | null>(null);
  const attempts = useRef(new Map<string, string>());
  const [eventData, setEvent] = useState<EventData | null>(null), [registrationData, setRegistration] = useState<Registration | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null), [selectedId, setSelectedId] = useState(activityId || '');
  const [priceOptionId, setPriceOptionId] = useState('');
  const [step, setStep] = useState<Step>(id ? 3 : 1), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [warning, setWarning] = useState(''), [copied, setCopied] = useState(false);
  const [alreadyRegisteredId, setAlreadyRegisteredId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('APPROVED'), [requestedOutcome, setRequestedOutcome] = useState<Outcome | null>(null);
  const [method, setMethod] = useState('PIX'), [now, setNow] = useState(Date.now());
  const token = session?.token;
  const routeIdentity = `${token || ''}:${id || ''}:${eventId || ''}:${activityId || ''}`;
  const latestRoute = useRef(routeIdentity);
  latestRoute.current = routeIdentity;
  // O Router pode reutilizar o componente: nunca mostrar o DTO de outro identificador.
  const event = eventId && eventData?.id === eventId ? eventData : null;
  const availability = useEventAvailability(event?.id, step === 1);
  const existingRegistrations = useEventRegistrations(event?.id, !id && step <= 2);
  const registration = id && registrationData?.id === id && registrationData.userId === session?.user.id ? registrationData : null;
  const closePath = registration || id ? '/minhas-inscricoes' : '/eventos/' + eventId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!session) return;
    const element = dialog.current, previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element && !element.open) element.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [Boolean(session)]);
  function applyState(state: ReservationState) {
    const previousStatus = currentStatus.current;
    currentStatus.current = state.registration.status;
    setRegistration(state.registration);
    if (state.payment !== undefined) setPayment(state.payment);
    setWarning(state.warning || '');
    if (state.registration.status !== 'PENDING_PAYMENT') setStep(4);
    else if (previousStatus === 'WAITLISTED') setStep(3);
  }
  function startOperation() {
    const epoch = ++operationEpoch.current, route = latestRoute.current;
    operation.current = true; setBusy(true); setError('');
    return {
      isCurrent: () => mounted.current && latestRoute.current === route && operationEpoch.current === epoch,
      finish: () => {
        if (operationEpoch.current === epoch) {
          operation.current = false;
          if (mounted.current && latestRoute.current === route) setBusy(false);
        }
      },
    };
  }
  useEffect(() => {
    if (!token) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const effectRoute = latestRoute.current;
    const sameRoute = () => active && latestRoute.current === effectRoute;
    const loadEpoch = ++operationEpoch.current;
    operation.current = false; setBusy(false);
    currentStatus.current = null;
    setEvent(null);
    setLoading(true); setError(''); setWarning(''); setCopied(false);
    if (!id) { setRegistration(null); setPayment(null); setRequestedOutcome(null); setAlreadyRegisteredId(null); setStep(1); }
    else { setRegistration(previous => previous?.id === id && previous.userId === session?.user.id ? previous : null); setPayment(null); }
    async function load() {
      try {
        if (id) {
          const savedOutcome = stored('eventhub-payment-attempt:' + id);
          if (active) {
            const previous = savedOutcome === 'APPROVED' || savedOutcome === 'DECLINED' || savedOutcome === 'EXPIRED' ? savedOutcome : null;
            setRequestedOutcome(previous); setOutcome(previous || 'APPROVED');
          }
          const state = await readReservation(token!, id);
          if (!sameRoute() || operationEpoch.current !== loadEpoch) return;
          applyState(state); setSelectedId(state.registration.activityId);
          setStep(state.registration.status === 'PENDING_PAYMENT' ? 3 : 4);
        } else if (eventId) {
          const { event: loaded } = await api<{ event: EventData }>('/events/' + eventId, token);
          if (sameRoute() && operationEpoch.current === loadEpoch) { setEvent(loaded); setSelectedId(activityId || loaded.activities[0]?.id || ''); }
        }
      } catch (error) { if (sameRoute() && operationEpoch.current === loadEpoch) setError(errorMessage(error)); }
      finally { if (sameRoute()) setLoading(false); }
    }
    async function poll() {
      if (!sameRoute() || !id) return;
      if (currentStatus.current && !['PENDING_PAYMENT', 'WAITLISTED'].includes(currentStatus.current)) return;
      if (!operation.current) {
        const pollEpoch = operationEpoch.current;
        try { const state = await readReservation(token!, id); if (sameRoute() && operationEpoch.current === pollEpoch && !operation.current) applyState(state); }
        catch (error) { if (sameRoute() && operationEpoch.current === pollEpoch && !operation.current) setWarning('Não foi possível atualizar a inscrição. ' + errorMessage(error)); }
      }
      if (sameRoute() && (!currentStatus.current || ['PENDING_PAYMENT', 'WAITLISTED'].includes(currentStatus.current))) timer = setTimeout(poll, 5000);
    }
    void load().then(() => { if (sameRoute() && id) timer = setTimeout(poll, 5000); });
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [id, eventId, activityId, token]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { const body = dialog.current?.querySelector('.participant-checkout__body'); if (body) body.scrollTop = 0; }, [step]);
  const activity = registration?.activity || event?.activities.find(item => item.id === selectedId);
  useEffect(() => { setPriceOptionId(''); }, [selectedId, routeIdentity]);
  const rates = activity?.priceOptions || [];
  const activeRates = rates.filter(rate => new Date(rate.startsAt).getTime() <= now && now < new Date(rate.endsAt).getTime());
  const selectedRate = activeRates.find(rate => rate.id === priceOptionId);
  const quoteMissing = !registration && rates.length > 0 && !selectedRate;
  const quotedPrice = registration?.priceCents ?? selectedRate?.priceCents ?? activity?.priceCents ?? 0;
  const existingActivity = activity ? existingRegistrations.activities.get(activity.id) : undefined;
  const selectedExisting = existingActivity && activeRegistration(existingActivity, now) ? existingActivity : undefined;
  const expiresAt = registration?.expiresAt ? new Date(registration.expiresAt).getTime() : NaN;
  const seconds = Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;
  const countdown = seconds === null ? null : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  const pending = registration?.status === 'PENDING_PAYMENT', confirmed = registration?.status === 'CONFIRMED';
  const paymentPending = Boolean(payment);
  const title = registration?.eventTitle || event?.title || 'Inscrição no evento';
  function displayReservation(value: Registration) {
    currentStatus.current = value.status;
    setRegistration(value); setStep(value.status === 'PENDING_PAYMENT' ? 3 : 4);
    navigate('/pagamento/' + value.id, { replace: true });
  }
  function displayExisting(value: Registration) {
    setAlreadyRegisteredId(value.id);
    displayReservation(value);
  }
  async function confirm() {
    if (!session || !activity || operation.current) return;
    if (registration) { setStep(registration.status === 'PENDING_PAYMENT' ? 3 : 4); return; }
    if (!event) return;
    if (selectedExisting) { displayExisting(selectedExisting); return; }
    if (quoteMissing) { setError('Selecione um lote e uma categoria disponíveis.'); return; }
    if (existingRegistrations.loading || existingRegistrations.failed) return;
    const request = startOperation(); setWarning('');
    const storageKey = `eventhub-reservation-attempt:${session.user.id}:${event.id}:${activity.id}:${priceOptionId || 'base'}`;
    let key = attempts.current.get(storageKey) || stored(storageKey);
    if (!key) key = crypto.randomUUID();
    attempts.current.set(storageKey, key); remember(storageKey, key);
    let attempted = false;
    try {
      // Recheck before the write: another tab may have enrolled after activity selection.
      const { registrations } = await api<{ registrations: Registration[] }>('/registrations', session.token);
      if (!request.isCurrent()) return;
      const existing = registrations.find(value => value.userId === session.user.id && value.eventId === event.id && value.activityId === activity.id && activeRegistration(value));
      if (existing) { remember(storageKey, null); attempts.current.delete(storageKey); displayExisting(existing); return; }
      attempted = true;
      const value = await reserve(session.token, event.id, activity.id, key, selectedRate?.id);
      remember(storageKey, null); attempts.current.delete(storageKey);
      if (request.isCurrent()) displayReservation(value);
    } catch (error) {
      if (!request.isCurrent()) return;
      if (!attempted) { setError('Não foi possível verificar suas inscrições. Tente novamente antes de reservar.'); return; }
      // Recuperar a reserva antes de oferecer repetição de um POST com resultado incerto.
      try {
        const { registrations } = await api<{ registrations: Registration[] }>('/registrations', session.token);
        const existing = registrations.find(value => value.userId === session.user.id && value.eventId === event.id && value.activityId === activity.id && activeRegistration(value));
        if (existing) { remember(storageKey, null); attempts.current.delete(storageKey); if (request.isCurrent()) displayExisting(existing); return; }
      } catch { /* A próxima tentativa reutiliza exatamente a mesma chave. */ }
      if (request.isCurrent()) setError(errorMessage(error) + ' Ao tentar novamente, consultaremos a mesma solicitação, sem duplicar a reserva.');
    } finally { request.finish(); }
  }
  async function pay() {
    if (!session || !registration || !pending || operation.current || seconds === 0 || paymentPending) return;
    const request = startOperation();
    const chosenOutcome = requestedOutcome || outcome;
    setRequestedOutcome(chosenOutcome); remember('eventhub-payment-attempt:' + registration.id, chosenOutcome);
    try {
      if (requestedOutcome) {
        const current = await readReservation(session.token, registration.id);
        if (request.isCurrent()) applyState(current);
        else return;
        if (current.registration.status !== 'PENDING_PAYMENT' || current.payment) return;
        if (current.warning) throw new Error('Consulte novamente o estado antes de repetir a simulação.');
      }
      const result = await api<{ payment: Payment }>('/payments/' + registration.id, session.token, 'POST', { outcome: chosenOutcome });
      if (!request.isCurrent()) return;
      setPayment(result.payment);
      const state = await readReservation(session.token, registration.id);
      if (request.isCurrent()) applyState(state);
    } catch (error) {
      if (!request.isCurrent()) return;
      try {
        const state = await readReservation(session.token, registration.id);
        if (request.isCurrent()) { applyState(state); if (state.registration.status === 'PENDING_PAYMENT' && !state.payment) setError(errorMessage(error) + ' Consulte o estado ou repita a mesma simulação.'); }
      } catch { if (request.isCurrent()) setError(errorMessage(error) + ' O resultado será consultado novamente; não inicie outro pagamento.'); }
    } finally { request.finish(); }
  }
  async function refresh() {
    if (!session || !registration || operation.current) return;
    const request = startOperation();
    try { const state = await readReservation(session.token, registration.id); if (request.isCurrent()) applyState(state); }
    catch (error) { if (request.isCurrent()) setError(errorMessage(error)); }
    finally { request.finish(); }
  }
  async function cancel() {
    if (!session || !registration || operation.current) return;
    const request = startOperation();
    try {
      const data = await api<{ registration: Registration }>('/registrations/' + registration.id + '/cancel', session.token, 'POST', {});
      if (request.isCurrent()) { currentStatus.current = data.registration.status; setRegistration(data.registration); setStep(4); }
    } catch (error) {
      if (!request.isCurrent()) return;
      if (request.isCurrent()) setError(errorMessage(error));
      try { const state = await readReservation(session.token, registration.id); if (request.isCurrent()) applyState(state); } catch { /* A consulta pode ser retomada manualmente. */ }
    } finally { request.finish(); }
  }
  async function copyReceipt() {
    if (!registration || !confirmed || !session) return;
    const route = latestRoute.current;
    const text = `EventHub — comprovante de inscrição\nInscrição: ${registration.id}\nEvento: ${registration.eventTitle}\nAtividade: ${registration.activity.title}\nParticipante: ${session.user.name}\nData: ${date(registration.activity.startsAt)}\nLocal: ${registration.activity.location}\nValor: ${registration.priceCents ? money(registration.priceCents) : 'Gratuito'}\nEstado: Confirmada\n${window.location.origin}/inscricoes/${registration.id}`;
    try { await navigator.clipboard.writeText(text); if (mounted.current && latestRoute.current === route) setCopied(true); }
    catch { if (mounted.current && latestRoute.current === route) setError('Não foi possível copiar. O identificador e o link do comprovante estão disponíveis abaixo.'); }
  }
  const footer = <footer className="participant-checkout__footer">
    {pending && countdown !== null ? <p className="participant-checkout__clock"><Icon file="9264c" />Reserva: <strong>{countdown} min</strong></p> : <span />}
    <div className="participant-checkout__buttons">
      {step === 1 && <><Link className="secondary-button" to={closePath}>Cancelar</Link><button className="primary-button" disabled={!activity || loading || busy || existingRegistrations.loading || existingRegistrations.failed} onClick={() => selectedExisting ? displayExisting(selectedExisting) : setStep(2)}>{selectedExisting ? registrationAction(selectedExisting) : 'Continuar'}</button></>}
      {step === 2 && <><button className="secondary-button" disabled={busy} onClick={() => registration ? navigate(closePath) : setStep(1)}>Voltar</button><button className="primary-button" disabled={!activity || busy || (!selectedExisting && quoteMissing) || (!registration && (existingRegistrations.loading || existingRegistrations.failed))} onClick={confirm}>{busy ? 'Verificando inscrição…' : selectedExisting ? registrationAction(selectedExisting) : registration ? 'Continuar' : 'Confirmar e Continuar'}</button></>}
      {step === 3 && <><button className="secondary-button" disabled={busy} onClick={() => setStep(2)}>Voltar</button><button className="primary-button" disabled={busy || loading || !pending || seconds === 0 || paymentPending} onClick={pay}>{busy ? 'Processando…' : paymentPending ? 'Aguardando confirmação' : 'Simular pagamento'}</button></>}
      {step === 4 && <Link className="primary-button" to="/minhas-inscricoes">Minhas inscrições</Link>}
    </div>
  </footer>;
  return <BusinessLayout><dialog ref={dialog} className="checkout-dialog participant-checkout" aria-label="Inscrição na Atividade" onCancel={event => { event.preventDefault(); navigate(closePath); }}>
    <section className="participant-checkout__card">
      <header className="participant-checkout__header"><h1 className="participant-checkout__accessible-title">Inscrição na Atividade</h1><Link className="participant-checkout__close" to={closePath} aria-label="Fechar inscrição"><Icon file="3b42a" /></Link>
        <ol className="participant-checkout__steps" aria-label="Etapas da inscrição">{['Atividade', 'Dados Pessoais', 'Pagamento', 'Confirmação'].map((label, index) => <li key={label} className={step === index + 1 ? 'active' : ''} aria-current={step === index + 1 ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
      </header>
      <div key={step} className="participant-checkout__body" data-motion-step={step}><h2 className="participant-checkout__event">{title}</h2><Feedback loading={loading} error={error} />{warning && <p className="info" role="status">{warning}</p>}
        {!loading && !activity && !error && <p className="error" role="alert">Atividade não encontrada ou indisponível para inscrição.</p>}
        {alreadyRegisteredId === registration?.id && registration && activeRegistration(registration, now) && <ExistingRegistrationNotice registration={registration} showLink={false} />}
        {!id && step <= 2 && event && (existingRegistrations.loading ? <p className="participant-checkout__note" role="status">Consultando suas inscrições…</p> : existingRegistrations.failed ? <p className="info" role="alert">Não foi possível consultar suas inscrições. <button type="button" className="text-button" onClick={existingRegistrations.reload}>Consultar inscrições novamente</button></p> : null)}
        {step === 2 && selectedExisting && <ExistingRegistrationNotice registration={selectedExisting} showLink={false} />}
        {step === 1 && event && !loading && <><p className="participant-checkout__instruction">Selecione a atividade prática ou trilha em que deseja se inscrever:</p>{availability.failed && <p className="participant-checkout__note">Não foi possível consultar as vagas agora. <button type="button" className="text-button" onClick={availability.reload}>Atualizar vagas</button></p>}<fieldset className="participant-checkout__activities"><legend className="participant-checkout__accessible-title">Atividade</legend>{event.activities.map(item => <label key={item.id} className={'participant-checkout__activity' + (selectedId === item.id ? ' selected' : '')}>
          <input type="radio" name="checkout-activity" value={item.id} checked={selectedId === item.id} onChange={() => setSelectedId(item.id)} aria-label={item.title} /><div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}<ul><li><Icon file="9264c" />{duration(item)}</li><li><Icon file="10879" />{item.location}</li><li><Icon file="98116" />{item.responsible}</li></ul><p className="participant-checkout__activity-seats"><ActivitySeats availability={availability.activities.get(item.id)} loading={availability.loading} /></p>{existingRegistrations.activities.has(item.id) && <ExistingRegistrationNotice registration={existingRegistrations.activities.get(item.id)!} showLink={false} />}<p className="participant-checkout__activity-price">{item.priceCents ? money(item.priceCents) : 'Gratuito'}</p></div>
        </label>)}</fieldset><p className="participant-checkout__note">A disponibilidade será verificada ao confirmar os dados. A reserva e seu prazo só começam quando uma vaga é reservada pelo sistema.</p></>}
        {step === 2 && activity && <><div className="participant-checkout__selection"><p><strong>Atividade selecionada:</strong> {activity.title}</p>{!registration && <button className="text-button" onClick={() => setStep(1)}>Alterar</button>}</div><p className="participant-checkout__instruction">Confira seus dados pessoais para a inscrição:</p>
          <div className="participant-checkout__personal"><label className="wide">Nome Completo<input readOnly value={session?.user.name || ''} /></label><label>E-mail<input readOnly value={session?.user.email || ''} /></label><label>CPF<input readOnly value={maskedCpf(session?.user.cpf)} /></label><label>Telefone<input readOnly value={formatInput(session?.user.phone || '', 'phone') || 'Não informado'} /></label><label>Perfil de acesso<input readOnly value="Participante" /></label></div>
          <div className="participant-checkout__payment-result">{!registration && rates.length > 0 && <><label htmlFor="checkout-rate">Lote e categoria de preço<RequiredMark /></label><select id="checkout-rate" required value={priceOptionId} disabled={busy} onChange={e => setPriceOptionId(e.target.value)}><option value="">Selecione uma opção</option>{activeRates.map(rate => <option key={rate.id} value={rate.id}>{rate.lotName} · {rate.category} · {money(rate.priceCents)}</option>)}</select>{!activeRates.length && <p className="error" role="status">Nenhum lote está aberto para inscrição neste momento.</p>}<p className="participant-checkout__note">Selecione a categoria correspondente ao seu perfil. O preço e o período do lote serão conferidos pelo servidor ao reservar.</p></>}{!quoteMissing && <p><strong>Valor da inscrição: {money(quotedPrice)}</strong>{registration?.priceOption && <> · {registration.priceOption.lotName} · {registration.priceOption.category}</>}</p>}</div><p className="participant-checkout__note">Se precisar atualizar seus dados, acesse <Link to="/perfil">Editar perfil</Link> e retorne à inscrição.</p><p className="participant-checkout__note">{quotedPrice ? 'Atividades pagas só são confirmadas após a aprovação do pagamento simulado.' : 'A atividade gratuita será confirmada se houver disponibilidade.'} {activity.waitlistEnabled !== false ? 'Se as vagas estiverem ocupadas, você poderá entrar na lista de espera.' : 'Esta atividade não possui lista de espera.'}</p></>}
        {step === 3 && registration && activity && <><p className="participant-checkout__instruction">Resumo da sua inscrição e pagamento:</p><section className="participant-checkout__summary" aria-label="Resumo da inscrição"><div><small>Evento principal</small><strong>{registration.eventTitle}</strong></div><div><small>Atividade selecionada</small><strong>{activity.title}</strong></div><div className="participant-checkout__total"><strong>Total a pagar:</strong><strong>{money(registration.priceCents)}</strong></div></section>
          <p className={'status-badge status-' + registration.status} role="status">{statusLabel[registration.status]}</p>{payment && <p className="participant-checkout__note">Pagamento: <strong>{statusLabel[payment.status]}</strong>{payment.status === 'APPROVED' && pending ? '. Aguardando a confirmação da inscrição pelo serviço responsável.' : ''}</p>}{seconds === 0 && pending && <p className="error" role="status">O prazo da reserva terminou. Consulte o estado atualizado; o sistema liberará a vaga.</p>}
          <aside className="participant-checkout__simulation"><Icon file="06f06" /><p>Pagamento processado por um provedor externo simulado para demonstração acadêmica. Não há cobrança nem envio de dados bancários.</p></aside><fieldset className="participant-checkout__methods" disabled={busy || Boolean(requestedOutcome) || paymentPending}><legend>Formato da demonstração</legend>
            <label className={method === 'PIX' ? 'selected' : ''}><span><input type="radio" name="payment-method" aria-label="PIX" checked={method === 'PIX'} onChange={() => setMethod('PIX')} />PIX</span><p>Simulação de pagamento instantâneo.</p><div className="participant-checkout__method-demo"><strong>Demonstração PIX</strong><p>A aprovação ou a recusa será registrada ao simular o pagamento. Nenhum QR Code ou código de cobrança real é gerado.</p></div></label>
            <label className={method === 'CARD' ? 'selected' : ''}><span><input type="radio" name="payment-method" aria-label="Cartão de Crédito" checked={method === 'CARD'} onChange={() => setMethod('CARD')} />Cartão de Crédito</span><p>Simulação de pagamento por cartão.</p><div className="participant-checkout__method-demo participant-checkout__test-card"><small>CARTÃO DE DEMONSTRAÇÃO</small><strong>•••• •••• •••• 4242</strong><p>Dados fictícios. Nenhum número de cartão, validade ou CVV é solicitado.</p></div></label>
          </fieldset><div className="participant-checkout__payment-result"><label htmlFor="payment-outcome">Resultado da simulação</label><select id="payment-outcome" value={requestedOutcome || outcome} disabled={busy || Boolean(requestedOutcome) || paymentPending} onChange={event => setOutcome(event.target.value as Outcome)}><option value="APPROVED">Aprovar pagamento</option><option value="DECLINED">Recusar pagamento</option><option value="EXPIRED">Expirar pagamento</option></select></div><div className="participant-checkout__state-actions"><button className="text-button" disabled={busy} onClick={refresh}>Consultar estado</button>{pending && <button className="text-button" disabled={busy} onClick={cancel}>Cancelar inscrição</button>}</div></>}
        {step === 4 && registration && activity && <><h3 className="participant-checkout__result-title">{alreadyRegisteredId === registration.id && confirmed ? 'Você já está inscrito nesta atividade' : confirmed ? 'Inscrição confirmada com sucesso!' : registration.status === 'WAITLISTED' ? 'Você está na lista de espera' : registration.status === 'EXPIRED' ? 'Reserva expirada' : 'Inscrição cancelada'}</h3><p className={'status-badge status-' + registration.status} role="status">{statusLabel[registration.status]}</p>
          <div className={'participant-checkout__result' + (confirmed ? ' confirmed' : '')}><strong>{confirmed ? `Sua vaga está garantida, ${session?.user.name}!` : registration.status === 'WAITLISTED' ? 'A inscrição aguarda a liberação de uma vaga.' : 'Esta inscrição não possui uma vaga confirmada.'}</strong><p>{confirmed ? 'Consulte os dados e guarde o comprovante da sua participação.' : registration.status === 'WAITLISTED' ? 'A promoção ocorre por ordem de entrada. Se a atividade for paga, uma nova reserva iniciará o prazo para pagamento.' : payment?.status === 'DECLINED' ? 'O pagamento foi recusado e a vaga foi liberada.' : registration.status === 'EXPIRED' ? 'O prazo terminou e a vaga foi liberada. Uma aprovação tardia não confirma esta inscrição.' : 'A vaga foi liberada. Consulte o catálogo para iniciar uma nova inscrição.'}</p></div>
          <article className="participant-checkout__receipt" aria-label={confirmed ? 'Comprovante de inscrição' : 'Dados da inscrição'}><p className="participant-checkout__eyebrow">{confirmed ? 'INSCRIÇÃO CONFIRMADA' : 'INSCRIÇÃO NO EVENTO'}</p><h3>{registration.eventTitle}</h3><div className="participant-checkout__selection"><p><strong>Atividade:</strong><br />{activity.title}</p></div><dl><div><dt>Participante</dt><dd>{session?.user.name}</dd></div><div><dt>Valor</dt><dd>{registration.priceCents ? money(registration.priceCents) : 'Gratuito'}</dd></div><div className="wide"><dt>Data e local da atividade</dt><dd>{date(activity.startsAt)} até {date(activity.endsAt)}<br />{activity.location}</dd></div><div className="wide"><dt>Identificador da inscrição</dt><dd>{registration.id}</dd></div></dl>{payment && <p className="participant-checkout__note">Pagamento: {statusLabel[payment.status]}</p>}{confirmed && <CheckInCode value={registration.checkInCredential} />}{confirmed && <div className="participant-checkout__receipt-actions"><button className="secondary-button" onClick={copyReceipt}>Copiar comprovante</button><Link to={'/inscricoes/' + registration.id}>Link do comprovante</Link></div>}{copied && <p className="success" role="status">Comprovante copiado.</p>}</article>
          <div className="participant-checkout__state-actions"><button className="text-button" disabled={busy} onClick={refresh}>Consultar estado</button>{['CONFIRMED', 'WAITLISTED'].includes(registration.status) && <button className="text-button" disabled={busy} onClick={cancel}>Cancelar inscrição</button>}{['CANCELLED', 'EXPIRED'].includes(registration.status) && <Link to={'/eventos/' + registration.eventId + '/inscricao'}>Nova inscrição</Link>}</div></>}
      </div>{footer}
    </section>
  </dialog></BusinessLayout>;
}
