import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { addEventActivity, api, date, money } from '../../services/business';
import type { Activity, EventData, Speaker } from '../../services/business';
import { errorMessage } from '../../services/identity';
import { ActivityDialog } from './ActivityDialog';
import type { ActivityDraft } from './ActivityDialog';
import { OrganizerDialog } from './OrganizerDialog';
import './event-activities.css';

type Props = { event: EventData; onSaved: (event: EventData) => void; onNotice: (message: string) => void; onCheckIn?: (id: string) => void; onScan?: (id: string) => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void };
const blank = (): ActivityDraft => ({ title: '', kind: 'Workshop', description: '', startsAt: '', endsAt: '', location: '', responsible: '', speakerId: null, capacity: 30, priceCents: 0, waitlistEnabled: true });

export function EventActivities({ event, onSaved, onNotice, onCheckIn, onScan, disabled = false, onBusyChange }: Props) {
  const { session } = useAuth();
  const [query, setQuery] = useState(''), [adding, setAdding] = useState(false), [requestKey, setRequestKey] = useState('');
  const [newSpeakers, setNewSpeakers] = useState<Speaker[]>([]), [target, setTarget] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const editable = event.status === 'PUBLISHED' && Date.parse(event.startsAt) > Date.now();
  const items = event.activities.filter(item => (item.title + ' ' + item.responsible).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function add(activity: ActivityDraft) {
    if (!session) throw new Error('Entre novamente para adicionar uma atividade.');
    onBusyChange?.(true);
    try {
      const result = await addEventActivity(session.token, event.id, requestKey, { ...activity, startsAt: new Date(activity.startsAt).toISOString(), endsAt: new Date(activity.endsAt).toISOString() }, newSpeakers);
      onSaved(result.event); onNotice('Atividade adicionada à programação.');
    } finally { onBusyChange?.(false); }
  }
  async function remove() {
    if (!session || !target || busy) return;
    setBusy(true); onBusyChange?.(true); setError(''); onNotice('');
    try {
      const result = await api<{ event: EventData }>('/events/' + event.id + '/activities/' + target.id, session.token, 'DELETE');
      onSaved(result.event); onNotice('Atividade excluída da programação.'); setTarget(null);
    } catch (error) { setError(errorMessage(error)); }
    finally { onBusyChange?.(false); setBusy(false); }
  }
  return <section className="business-card event-activities" id="event-activities">
    <header className="section-toolbar"><div><h2>{onCheckIn ? 'Atividades e check-in' : 'Atividades do evento'}</h2><p>Adicione atividades ou exclua as que ainda não possuem histórico de inscrições. O evento deve manter pelo menos uma atividade.</p></div>
      {event.status === 'DRAFT' ? <Link className="secondary-button" to={'/organizacao/eventos/' + event.id + '#event-program'}>Editar atividades do rascunho</Link> : <button type="button" className="primary-button" disabled={disabled || busy || !editable || event.activities.length >= 50} onClick={() => { setNewSpeakers([]); setRequestKey(crypto.randomUUID()); setAdding(true); onNotice(''); }}>Adicionar atividade</button>}
    </header>
    {event.status !== 'DRAFT' && <p className="info">{editable ? 'Inclusões e exclusões são salvas imediatamente. Vagas, preços e horários das atividades existentes são preservados.' : 'As atividades podem ser adicionadas ou excluídas antes do início de um evento publicado.'}</p>}
    <input aria-label="Buscar atividades" placeholder="Buscar atividade ou responsável" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="event-activities__list">{items.map(item => <article className="event-activities__item" key={item.id}><div><h3>{item.title}</h3><p>{date(item.startsAt)} — {date(item.endsAt)}</p><p>{item.responsible} · {item.location}</p><small>{item.capacity} vagas · {money(item.priceCents)} · {item.kind || 'Atividade'}</small></div>
      <div className="event-activities__actions">{onCheckIn && <button type="button" className="secondary-button" onClick={() => onCheckIn(item.id)}>Lista de presença</button>}{onScan && <button type="button" className="secondary-button" disabled={event.status !== 'PUBLISHED'} onClick={() => onScan(item.id)}>Ler QR Code</button>}
        {event.status === 'PUBLISHED' && <button type="button" className="danger-button" aria-label={'Excluir atividade ' + item.title} disabled={disabled || busy || !editable || event.activities.length <= 1} title={event.activities.length <= 1 ? 'Mantenha pelo menos uma atividade no evento.' : undefined} onClick={() => { setError(''); setTarget(item); onNotice(''); }}>Excluir atividade</button>}
      </div></article>)}</div>
    {!items.length && <p className="empty-state">Nenhuma atividade encontrada.</p>}
    {adding && <ActivityDialog activity={blank()} event={event} speakers={[...event.speakers, ...newSpeakers]} onAddSpeaker={speaker => setNewSpeakers(current => [...current, speaker])} onSave={add} onClose={() => setAdding(false)} />}
    {target && <OrganizerDialog title="Excluir atividade?" description="A exclusão é permitida somente quando não existe histórico de inscrições nesta atividade." onClose={() => { if (!busy) setTarget(null); }} onSubmit={() => { void remove(); }} footer={<><button type="button" className="secondary-button" disabled={busy} onClick={() => setTarget(null)}>Voltar</button><button type="submit" className="danger-button" disabled={busy}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></>}><div><h3>{target.title}</h3><p>As demais atividades e suas inscrições serão preservadas.</p>{error && <p className="error" role="alert">{error}</p>}</div></OrganizerDialog>}
  </section>;
}
