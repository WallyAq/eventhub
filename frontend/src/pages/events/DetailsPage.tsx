import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BusinessLayout, Feedback, Icon } from '../../components/Business';
import { useData, date, money } from '../../services/business';
import type { Activity, EventData } from '../../services/business';
import { useEventAvailability } from '../../services/availability';
import { ActivitySeats } from '../../components/events/ActivitySeats';
import { useEventRegistrations } from '../../services/eventRegistrations';
import { ExistingRegistrationNotice } from '../../components/events/ExistingRegistrationNotice';
import './details.css';

function duration(activity: Activity) {
  const minutes = Math.round((new Date(activity.endsAt).getTime() - new Date(activity.startsAt).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60), remaining = minutes % 60;
  return hours ? `${hours}h${remaining ? ` ${remaining}min` : ''}` : `${remaining}min`;
}

export function EventDetailsPage() {
  const { id } = useParams();
  const { hash } = useLocation();
  const { data, error, loading } = useData<{ event: EventData }>('/events/' + id);
  const event = data && data.event.id === id ? data.event : null;
  const availability = useEventAvailability(event?.id);
  const registrations = useEventRegistrations(event?.id);
  const streamUrl = event?.streamUrl && /^https?:\/\//i.test(event.streamUrl) ? event.streamUrl : '';
  useEffect(() => {
    if (event && hash === '#atividades') document.getElementById('atividades')?.scrollIntoView({ block: 'start' });
  }, [event?.id, hash]);
  return <BusinessLayout>
    <div className="participant-details">
      <Link className="participant-details__back" to="/eventos">← Explorar eventos</Link>
      <Feedback loading={loading} error={error} />
      {event && <>
        <section className="business-card participant-details__heading" aria-labelledby="event-title">
          <h1 id="event-title">{event.title}</h1>
          {event.activities.length > 0 && <Link className="primary-button" to={'/eventos/' + event.id + '/inscricao'}>Inscreva-se</Link>}
        </section>

        <section className="business-card participant-details__section" aria-labelledby="event-about-title">
          <h2 id="event-about-title">Sobre o evento</h2>
          <p className="preserve-lines">{event.description}</p>
        </section>

        <section className="business-card participant-details__section" aria-labelledby="event-modality-title">
          <h2 id="event-modality-title">Modalidade e Transmissão</h2>
          <dl className="participant-details__information">
            <div><dt>Modalidade:</dt><dd>{event.modality === 'Online' ? 'Remoto' : event.modality}</dd></div>
            <div><dt>Data e Horário:</dt><dd>{date(event.startsAt)} até {date(event.endsAt)}{event.sessionTime && <span className="participant-details__session">{event.sessionTime}</span>}<span className="participant-details__session">Carga horária: {event.hours}h</span></dd></div>
            <div><dt>Local:</dt><dd>{event.location || 'Local não informado'}</dd></div>
            <div><dt>Link de Transmissão/Plataforma Oficial:</dt><dd>{streamUrl ? <a href={streamUrl} target="_blank" rel="noopener noreferrer" aria-label={'Acessar plataforma oficial: ' + streamUrl + ' (abre em nova aba)'}>{streamUrl}<span className="participant-details__external" aria-hidden="true">↗</span></a> : 'Não informado'}</dd></div>
          </dl>
        </section>

        <section className="business-card participant-details__section" id="atividades" aria-labelledby="event-activities-title">
          <h2 id="event-activities-title">Atividades Vinculadas</h2>
          <p className="participant-details__intro">Oficinas, workshops, trilhas e minicursos vinculados a esta edição do evento.</p>
          {availability.failed && <p className="participant-details__availability-error">Não foi possível consultar as vagas agora. <button type="button" className="text-button" onClick={availability.reload}>Atualizar vagas</button></p>}
          {registrations.failed && <p className="participant-details__availability-error">Não foi possível verificar suas inscrições agora. <button type="button" className="text-button" onClick={registrations.reload}>Atualizar inscrições</button></p>}
          {event.activities.length > 0 ? <div className="participant-details__activities">{event.activities.map(activity => <article className="participant-details__activity" key={activity.id}>
            <h3>{activity.title}</h3>
            {activity.description && <p className="participant-details__description preserve-lines">{activity.description}</p>}
            <div className="participant-details__activity-meta">
              <p><Icon file="ed882" /><span>{activity.location || event.location || 'Local não informado'}</span></p>
              <p><Icon file="46b9b" /><span>{date(activity.startsAt)} até {date(activity.endsAt)}{duration(activity) && <> · Duração: {duration(activity)}</>}</span></p>
              <p><Icon file="e12a2" /><span>Instrutor(a): {activity.responsible || 'Não informado'}</span></p>
              <p className="participant-details__capacity"><ActivitySeats availability={availability.activities.get(activity.id)} loading={availability.loading} /></p>
            </div>
            <div className="participant-details__activity-actions"><strong>{activity.priceCents ? money(activity.priceCents) : 'Gratuito'}</strong>{registrations.activities.has(activity.id) ? <ExistingRegistrationNotice registration={registrations.activities.get(activity.id)!} /> : registrations.loading ? <span role="status" className="participant-details__registration-loading">Consultando suas inscrições…</span> : <Link className="primary-button" to={'/atividades/' + event.id + '/' + activity.id + '/inscricao'}>Inscrever-se na atividade</Link>}</div>
          </article>)}</div> : <p className="participant-details__empty">Nenhuma atividade disponível neste evento.</p>}
        </section>

        <section className="business-card participant-details__section" aria-labelledby="event-speakers-title">
          <h2 id="event-speakers-title">Professores e Palestrantes Convidados</h2>
          <p className="participant-details__intro">Conheça os docentes e pesquisadores participantes.</p>
          {event.speakers.length > 0 ? <div className="participant-details__speakers">{event.speakers.map((speaker, index) => <article className="participant-details__speaker" key={speaker.id || index}>
            <h3>{speaker.name}</h3>
            {speaker.institution && <p className="participant-details__institution">{speaker.institution}</p>}
            {speaker.degree && <p className="participant-details__degree">{speaker.degree}</p>}
            {speaker.biography && <p className="preserve-lines">{speaker.biography}</p>}
          </article>)}</div> : <p className="participant-details__empty">Nenhum professor ou palestrante informado.</p>}
        </section>
      </>}
    </div>
  </BusinessLayout>;
}
