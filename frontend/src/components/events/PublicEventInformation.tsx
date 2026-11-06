import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../services/business';
import type { EventData } from '../../services/business';
import { errorMessage } from '../../services/identity';
import { RequiredMark } from '../form/RequiredMark';

type Information = Pick<EventData, 'title' | 'description' | 'location' | 'streamUrl' | 'sessionTime'>;
const from = (event: EventData): Information => ({ title: event.title, description: event.description, location: event.location, streamUrl: event.streamUrl, sessionTime: event.sessionTime });
export function PublicEventInformation({ event, reload, onNotice }: { event: EventData; reload: () => void; onNotice: (message: string) => void }) {
  const { session } = useAuth();
  const [draft, setDraft] = useState(() => from(event)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), token = useRef(session?.token); token.current = session?.token;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setDraft(from(event)); }, [event.title, event.description, event.location, event.streamUrl, event.sessionTime]);
  const disabled = busy || event.status !== 'PUBLISHED';
  function field<K extends keyof Information>(key: K, value: Information[K]) { setDraft(current => ({ ...current, [key]: value })); onNotice(''); }
  async function save() {
    if (!session || disabled) return;
    setBusy(true); setError(''); onNotice('');
    const current = session.token;
    try {
      const result = await api<{ notificationsQueued: boolean }>('/events/' + event.id + '/public-information', current, 'PATCH', draft);
      if (alive.current && token.current === current) { onNotice(result.notificationsQueued ? 'Informações salvas. Os avisos aos inscritos foram enfileirados.' : 'Nenhuma informação foi alterada.'); reload(); }
    } catch (error) { if (alive.current && token.current === current) setError(errorMessage(error)); }
    finally { if (alive.current && token.current === current) setBusy(false); }
  }
  if (event.status === 'DRAFT') return null;
  return <section className="business-card certificate-settings"><h2>Informações públicas e avisos</h2><p>Atualize os dados públicos do evento. Os inscritos receberão um aviso pela entrega de notificações configurada. Locais e horários específicos das atividades continuam definidos na programação publicada.</p>
    <form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={disabled}>
      <div className="form-field"><label htmlFor="public-event-title">Nome público do evento<RequiredMark /></label><input id="public-event-title" required minLength={2} maxLength={160} value={draft.title} onChange={e => field('title', e.target.value)} /></div>
      <div className="form-field"><label htmlFor="public-event-description">Descrição pública<RequiredMark /></label><textarea id="public-event-description" rows={4} required minLength={10} maxLength={5000} value={draft.description} onChange={e => field('description', e.target.value)} /></div>
      <div className="organizer-setting-grid"><div className="form-field"><label htmlFor="public-event-location">Local geral do evento<RequiredMark required={event.modality !== 'Online'} /></label><input id="public-event-location" required={event.modality !== 'Online'} maxLength={240} value={draft.location} onChange={e => field('location', e.target.value)} /></div>
        <div className="form-field"><label htmlFor="public-event-stream">Plataforma de transmissão<RequiredMark required={event.modality !== 'Presencial'} /></label><input id="public-event-stream" type="url" pattern="https://.*" required={event.modality !== 'Presencial'} maxLength={500} value={draft.streamUrl} onChange={e => field('streamUrl', e.target.value)} /></div>
        <div className="form-field"><label htmlFor="public-event-session">Horário informativo do evento</label><input id="public-event-session" maxLength={120} value={draft.sessionTime} onChange={e => field('sessionTime', e.target.value)} /></div></div>
      <button className="primary-button">{busy ? 'Salvando…' : 'Salvar e avisar inscritos'}</button>
    </fieldset></form>{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
