import { useState } from 'react';
import { Icon } from '../Business';
import { date, money } from '../../services/business';
import type { Activity, Speaker } from '../../services/business';
import { ActivityDialog } from './ActivityDialog';
import { SpeakerDialog } from './SpeakerDialog';
import './event-program.css';

type ActivityDraft = Omit<Activity, 'id'>;
type Program = { speakers: Speaker[]; activities: ActivityDraft[] };
type Props = Program & {
  event: { title: string; startsAt: string; endsAt: string };
  disabled: boolean;
  onChange: (program: Program) => void;
};

export function EventProgram({ speakers, activities, event, disabled, onChange }: Props) {
  const [speakerIndex, setSpeakerIndex] = useState<number | 'new' | null>(null);
  const [activityIndex, setActivityIndex] = useState<number | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function change(program: Program, message: string) {
    setError('');
    setMessage(message + ' Salve o rascunho para persistir as alterações.');
    onChange(program);
  }

  function saveSpeaker(speaker: Speaker, index: number | 'new' = 'new') {
    const next = index === 'new' ? [...speakers, speaker] : speakers.map((item, i) => i === index ? speaker : item);
    change({ speakers: next, activities: activities.map(item => item.speakerId === speaker.id ? { ...item, responsible: speaker.name } : item) }, 'Professor/palestrante adicionado ao formulário.');
  }

  function removeSpeaker(index: number) {
    const speaker = speakers[index];
    if (speaker.id && activities.some(item => item.speakerId === speaker.id)) {
      setError('Este professor está vinculado a uma atividade. Altere o responsável da atividade antes de removê-lo.');
      return;
    }
    change({ speakers: speakers.filter((_, i) => i !== index), activities }, 'Professor/palestrante removido do formulário.');
  }

  function saveActivity(activity: ActivityDraft) {
    const next = activityIndex === 'new' ? [...activities, activity] : activities.map((item, i) => i === activityIndex ? activity : item);
    change({ speakers, activities: next }, 'Atividade atualizada no formulário.');
  }

  const blank: ActivityDraft = { title: '', kind: 'Workshop', description: '', startsAt: '', endsAt: '', location: '', responsible: '', speakerId: null, capacity: 30, priceCents: 0, waitlistEnabled: true };
  return <>
    <section className="business-card event-program-section">
      <header className="section-toolbar"><div><h2>3. Professores e Palestrantes Convidados</h2><p>Docentes e instituições participantes</p></div><button className="secondary-button" type="button" disabled={disabled || speakers.length >= 30} onClick={() => setSpeakerIndex('new')}>Adicionar Palestrante</button></header>
      {speakers.length ? <div className="program-speakers">{speakers.map((speaker, index) => <article className="program-person" key={speaker.id || index}>
        <div className="program-person-heading"><strong>{speaker.name}</strong>{speaker.degree && <span className="program-tag">{speaker.degree}</span>}</div>
        <p>{speaker.institution || 'Instituição não informada'}</p>{speaker.email && <small>{speaker.email}</small>}
        {speaker.biography && <p className="program-biography">{speaker.biography}</p>}
        <div className="program-actions"><button type="button" className="text-button" disabled={disabled} aria-label={'Editar palestrante ' + (index + 1)} onClick={() => setSpeakerIndex(index)}>Editar</button><button type="button" className="icon-button" disabled={disabled} aria-label={'Remover palestrante ' + (index + 1)} onClick={() => removeSpeaker(index)}><Icon file="2fdcb" /></button></div>
      </article>)}</div> : <div className="program-empty"><p>Nenhum professor ou palestrante cadastrado neste evento.</p><small>Adicione os convidados para vinculá-los às atividades.</small></div>}
      <label className="certificate-option"><input type="checkbox" disabled />Gerar automaticamente certificado de palestrante / ministrante de curso <small>A emissão de certificados será disponibilizada em uma próxima etapa.</small></label>
    </section>
    <section className="business-card event-program-section" id="event-program">
      <header className="section-toolbar"><div><h2>4. Sub-eventos e Atividades Vinculadas</h2><p>Oficinas, trilhas paralelas e minicursos da programação</p></div><button className="secondary-button" type="button" disabled={disabled || activities.length >= 20} onClick={() => setActivityIndex('new')}>Adicionar Minicurso/Oficina</button></header>
      {activities.length ? <div className="program-activities">{activities.map((activity, index) => <article className="program-activity" key={index}>
        <div className="section-toolbar"><div><span className="program-tag">{activity.kind || 'Atividade'}</span><h3>{activity.title}</h3></div><div className="program-actions"><button type="button" className="text-button" disabled={disabled} aria-label={'Editar atividade ' + (index + 1)} onClick={() => setActivityIndex(index)}>Editar</button><button type="button" className="icon-button" disabled={disabled} aria-label={'Remover atividade ' + (index + 1)} onClick={() => change({ speakers, activities: activities.filter((_, i) => i !== index) }, 'Atividade removida do formulário.')}><Icon file="2fdcb" /></button></div></div>
        {activity.description && <p className="program-description">{activity.description}</p>}
        <div className="program-activity-meta"><p><Icon file="46b9b" />{date(activity.startsAt)} até {date(activity.endsAt)}</p><p><Icon file="ed882" />{activity.location}</p><p>Responsável: {activity.responsible}</p></div>
        <div className="program-activity-footer"><span>{activity.capacity} vagas · Lista de espera {activity.waitlistEnabled === false ? 'desativada' : 'ativada'}</span><strong>{activity.priceCents ? money(activity.priceCents) : 'Gratuita'}</strong></div>
      </article>)}</div> : <div className="program-empty"><p>Nenhuma atividade adicionada.</p><small>Adicione ao menos uma atividade antes de salvar o evento.</small></div>}
      {message && <p className="info" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    </section>
    {speakerIndex !== null && <SpeakerDialog speaker={speakerIndex === 'new' ? undefined : speakers[speakerIndex]} onSave={speaker => saveSpeaker(speaker, speakerIndex)} onClose={() => setSpeakerIndex(null)} />}
    {activityIndex !== null && <ActivityDialog activity={activityIndex === 'new' ? blank : activities[activityIndex]} event={event} speakers={speakers} onSave={saveActivity} onClose={() => setActivityIndex(null)} onAddSpeaker={speaker => saveSpeaker(speaker)} />}
  </>;
}
