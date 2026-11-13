import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../services/business';
import type { EventData } from '../../services/business';
import { errorMessage } from '../../services/identity';
import { RequiredMark } from '../form/RequiredMark';
import './public-event-information.css';

type Information = Pick<EventData, 'title' | 'description' | 'location' | 'streamUrl' | 'sessionTime'>;
const from = (event: EventData): Information => ({ title: event.title, description: event.description, location: event.location, streamUrl: event.streamUrl, sessionTime: event.sessionTime });
export function PublicEventInformation({ event, onSaved, onNotice, disabled: locked = false, onBusyChange }: { event: EventData; onSaved: (event: EventData) => void; onNotice: (message: string) => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const { session } = useAuth();
  const [draft, setDraft] = useState(() => from(event)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), token = useRef(session?.token); token.current = session?.token;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setDraft(from(event)); }, [event.title, event.description, event.location, event.streamUrl, event.sessionTime]);
  const disabled = busy || locked || event.status !== 'PUBLISHED';
  function field<K extends keyof Information>(key: K, value: Information[K]) { setDraft(current => ({ ...current, [key]: value })); setError(''); onNotice(''); }
  async function save() {
    if (!session || disabled) return;
    setBusy(true); onBusyChange?.(true); setError(''); onNotice('');
    const current = session.token;
    try {
      const result = await api<{ event: EventData; notificationsQueued: boolean }>('/events/' + event.id + '/public-information', current, 'PATCH', draft);
      if (alive.current && token.current === current) { onSaved(result.event); onNotice(result.notificationsQueued ? 'Informações salvas. Os inscritos receberão um aviso das alterações.' : 'Nenhuma informação foi alterada.'); }
    } catch (error) { if (alive.current && token.current === current) setError(errorMessage(error)); }
    finally { onBusyChange?.(false); if (alive.current && token.current === current) setBusy(false); }
  }
  if (event.status === 'DRAFT') return null;
  return <section className="business-card public-event-information"><header><h2>Informações do evento</h2><p>Atualize os dados exibidos na página do evento. Ao salvar alterações, os inscritos receberão um aviso. Locais e horários específicos das atividades continuam definidos na programação publicada.</p></header>
    <form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={disabled}>
      <div className="form-field"><label htmlFor="public-event-title">Nome do evento<RequiredMark /></label><input id="public-event-title" required minLength={2} maxLength={160} value={draft.title} onChange={e => field('title', e.target.value)} /></div>
      <div className="form-field"><label htmlFor="public-event-description">Descrição do evento<RequiredMark /></label><textarea id="public-event-description" rows={4} required minLength={10} maxLength={5000} value={draft.description} onChange={e => field('description', e.target.value)} /></div>
      <div className="organizer-setting-grid"><div className="form-field"><label htmlFor="public-event-location">Local geral do evento<RequiredMark required={event.modality !== 'Online'} /></label><input id="public-event-location" required={event.modality !== 'Online'} maxLength={240} value={draft.location} onChange={e => field('location', e.target.value)} /></div>
        <div className="form-field"><label htmlFor="public-event-stream">Plataforma de transmissão<RequiredMark required={event.modality !== 'Presencial'} /></label><input id="public-event-stream" type="url" pattern="https://.*" required={event.modality !== 'Presencial'} maxLength={500} value={draft.streamUrl} onChange={e => field('streamUrl', e.target.value)} /></div>
        <div className="form-field"><label htmlFor="public-event-session">Horário informativo do evento</label><input id="public-event-session" maxLength={120} value={draft.sessionTime} onChange={e => field('sessionTime', e.target.value)} /></div></div>
      <div className="public-event-information__actions"><button className="primary-button" type="submit">{busy ? 'Salvando…' : 'Salvar alterações e avisar inscritos'}</button></div>
    </fieldset></form>{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
