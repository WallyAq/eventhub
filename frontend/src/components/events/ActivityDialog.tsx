import { PriceOptionsEditor } from './PriceOptionsEditor';
import { RequiredMark } from '../form/RequiredMark';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { Activity, Speaker } from '../../services/business';
import { OrganizerDialog } from './OrganizerDialog';
import { SpeakerDialog } from './SpeakerDialog';
import { SpeakerPicker } from './SpeakerPicker';
import type { SpeakerOption } from './SpeakerPicker';
import { errorMessage } from '../../services/identity';

export type ActivityDraft = Omit<Activity, 'id'>;
type Props = { activity: ActivityDraft; event: { title: string; startsAt: string; endsAt: string }; speakers: Speaker[]; onSave: (activity: ActivityDraft) => void | Promise<void>; onClose: () => void; onAddSpeaker: (speaker: Speaker) => void };
const kinds = [['Curso', '95ba4'], ['Minicurso', '31e39'], ['Workshop', '83cdb'], ['Palestra', 'd8fc6']] as const;
const pad = (value: number) => String(value).padStart(2, '0');
function localParts(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` } : { date: '', time: '' };
}
const speakerKey = (speaker: Speaker, index: number) => speaker.id || `existing-speaker-${index}`;

export function ActivityDialog({ activity, event, speakers, onSave, onClose, onAddSpeaker }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<ActivityDraft>(() => ({ ...structuredClone(activity), kind: activity.kind || 'Workshop', description: activity.description || '', waitlistEnabled: activity.waitlistEnabled ?? true }));
  const [day, setDay] = useState(() => localParts(activity.startsAt || event.startsAt).date);
  const [hasSeparateEndDay] = useState(() => {
    const startDay = localParts(activity.startsAt).date, endDay = localParts(activity.endsAt).date;
    return !!startDay && !!endDay && startDay !== endDay;
  });
  const [endDay, setEndDay] = useState(() => localParts(activity.endsAt).date);
  const [starts, setStarts] = useState(() => localParts(activity.startsAt).time);
  const [ends, setEnds] = useState(() => localParts(activity.endsAt).time);
  const [capacity, setCapacity] = useState(String(activity.capacity));
  const [price, setPrice] = useState((activity.priceCents / 100).toFixed(2));
  const [free, setFree] = useState(activity.priceCents === 0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingSpeaker, setAddingSpeaker] = useState(false);
  const [addedSpeakers, setAddedSpeakers] = useState<Speaker[]>([]);
  const availableSpeakers = [...speakers, ...addedSpeakers.filter(speaker => !speakers.some(item => item.id === speaker.id))];
  const speakerOptions: SpeakerOption[] = availableSpeakers.map((speaker, index) => ({ value: speakerKey(speaker, index), speaker }));
  if (activity.responsible && !activity.speakerId) speakerOptions.push({ value: 'legacy-responsible', speaker: { name: activity.responsible, institution: '' }, legacy: true });
  const [selectedSpeaker, setSelectedSpeaker] = useState(() => {
    const index = speakers.findIndex(speaker => activity.speakerId ? speaker.id === activity.speakerId : speaker.name === activity.responsible);
    return index >= 0 ? speakerKey(speakers[index], index) : activity.responsible ? 'legacy-responsible' : '';
  });
  function field<K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setError(''); }
  function chooseSpeaker(value: string) {
    setSelectedSpeaker(value);
    if (value === 'legacy-responsible') { setDraft(current => ({ ...current, responsible: activity.responsible, speakerId: null })); return; }
    const index = availableSpeakers.findIndex((speaker, index) => speakerKey(speaker, index) === value);
    const speaker = availableSpeakers[index];
    setDraft(current => ({ ...current, responsible: speaker?.name || '', speakerId: speaker?.id || null }));
    setError('');
  }
  async function submit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (saving) return;
    const startsAt = `${day}T${starts}`, endsAt = `${hasSeparateEndDay ? endDay : day}T${ends}`;
    const startDate = new Date(startsAt), endDate = new Date(endsAt), eventStart = new Date(event.startsAt), eventEnd = new Date(event.endsAt);
    const responsibleSpeaker = availableSpeakers.find((speaker, index) => speakerKey(speaker, index) === selectedSpeaker);
    const responsible = responsibleSpeaker?.name ?? draft.responsible;
    if (draft.title.trim().length < 2 || draft.title.trim().length > 160) return setError('Informe um nome de atividade com 2 a 160 caracteres.');
    if ((draft.description || '').trim().length < 10 || (draft.description || '').length > 5000) return setError('A descrição e os requisitos devem ter 10 a 5.000 caracteres.');
    if (!selectedSpeaker || (!responsibleSpeaker && selectedSpeaker !== 'legacy-responsible') || responsible.trim().length < 2) return setError('Selecione o responsável pela atividade.');
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) return setError('O horário de término deve ser posterior ao horário de início.');
    if (!Number.isFinite(eventStart.getTime()) || !Number.isFinite(eventEnd.getTime()) || startDate < eventStart || endDate > eventEnd) return setError('A atividade deve ocorrer inteiramente dentro do período do evento. Revise as datas do evento.');
    if (draft.location.trim().length < 2 || draft.location.trim().length > 240) return setError('Informe um local com 2 a 240 caracteres.');
    const rates = draft.priceOptions || [];
    if (rates.some(rate => !rate.lotName.trim() || !rate.category.trim() || !Number.isInteger(rate.priceCents) || rate.priceCents < 0 || !Number.isFinite(Date.parse(rate.startsAt)) || !Number.isFinite(Date.parse(rate.endsAt)) || Date.parse(rate.endsAt) <= Date.parse(rate.startsAt) || Date.parse(rate.endsAt) > eventStart.getTime())) return setError('Revise nomes, preços e períodos dos lotes. As vendas devem terminar até o início do evento.');
    const total = Number(capacity), priceCents = rates.length ? Math.min(...rates.map(rate => rate.priceCents)) : free ? 0 : Math.round(Number(price) * 100);
    if (!Number.isInteger(total) || total < 1 || total > 100000) return setError('O número de vagas deve ser um inteiro entre 1 e 100.000.');
    if (!rates.length && !free && (!price || !Number.isFinite(priceCents) || priceCents < 1 || priceCents > 10000000)) return setError('Informe um valor entre R$ 0,01 e R$ 100.000,00, ou marque a atividade como gratuita.');
    setSaving(true); setError('');
    try {
      await onSave({ ...draft, title: draft.title.trim(), description: draft.description?.trim(), location: draft.location.trim(), responsible: responsible.trim(), speakerId: responsibleSpeaker?.id ?? null, startsAt, endsAt, capacity: total, priceCents });
      onClose();
    } catch (error) { setError(errorMessage(error)); }
    finally { setSaving(false); }
  }
  return <>
    <OrganizerDialog title={activity.title ? 'Editar Atividade do Evento' : 'Nova Atividade do Evento'} description={<>Cadastre minicursos, palestras ou workshops vinculados ao <strong>{event.title || 'seu evento'}</strong></>} onClose={() => { if (!saving) onClose(); }} onSubmit={submit} className="activity-dialog" figmaNode="2053:2589" footer={<><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
      {error && <p className="organizer-dialog__error" role="alert">{error}</p>}
      <fieldset disabled={saving} className="activity-dialog-fields">
      <section className="organizer-dialog__section"><h3>1. Informações da Atividade</h3>
        <div className="organizer-dialog__field"><label htmlFor={`${id}-title`}>Nome da atividade<RequiredMark /></label><input id={`${id}-title`} required minLength={2} maxLength={160} placeholder="Ex: Workshop Prático de Visão Computacional" value={draft.title} onChange={change => field('title', change.target.value)} /></div>
        <fieldset className="activity-kind"><legend>Tipo de atividade<RequiredMark /></legend><div className="activity-kind__options">{kinds.map(([kind, icon]) => <label key={kind} className={draft.kind === kind ? 'selected' : ''}><input type="radio" required name={`${id}-kind`} value={kind} checked={draft.kind === kind} onChange={() => field('kind', kind)} /><img src={`/figma/organizer/${icon}.svg`} alt="" /><span>{kind}</span></label>)}</div></fieldset>
        <div className="organizer-dialog__field"><div className="organizer-dialog__label-row"><label htmlFor={`${id}-description`}>Descrição e Requisitos<RequiredMark /></label><span>Ementa, pré-requisitos e objetivos</span></div><textarea id={`${id}-description`} required minLength={10} maxLength={5000} rows={4} placeholder="Descreva a ementa, os pré-requisitos e os objetivos da atividade." value={draft.description} onChange={change => field('description', change.target.value)} /></div>
        <div className="organizer-dialog__field"><label htmlFor={`${id}-speaker`}>Responsável/Palestrante<RequiredMark /></label><SpeakerPicker id={`${id}-speaker`} options={speakerOptions} value={selectedSpeaker} required onChange={chooseSpeaker} onAdd={() => setAddingSpeaker(true)} canAdd={availableSpeakers.length < 30} /></div>
      </section>
      <section className="organizer-dialog__section"><h3>2. Data e Horário</h3><div className="organizer-dialog__grid organizer-dialog__grid--three">
        <div className="organizer-dialog__field"><label htmlFor={`${id}-day`}>Data da Atividade<RequiredMark /></label><input id={`${id}-day`} type="date" required min={localParts(event.startsAt).date || undefined} max={localParts(event.endsAt).date || undefined} value={day} onChange={change => { setDay(change.target.value); setError(''); }} /></div>
        <div className="organizer-dialog__field"><label htmlFor={`${id}-start`}>Horário de Início<RequiredMark /></label><input id={`${id}-start`} type="time" required value={starts} onChange={change => { setStarts(change.target.value); setError(''); }} /></div>
        <div className="organizer-dialog__field"><label htmlFor={`${id}-end`}>Horário de Término<RequiredMark /></label><input id={`${id}-end`} type="time" required value={ends} onChange={change => { setEnds(change.target.value); setError(''); }} /></div>
      </div>{hasSeparateEndDay && <div className="organizer-dialog__field"><label htmlFor={`${id}-end-day`}>Data de término da atividade<RequiredMark /></label><input id={`${id}-end-day`} type="date" required min={day || undefined} max={localParts(event.endsAt).date || undefined} value={endDay} onChange={change => { setEndDay(change.target.value); setError(''); }} /></div>}<div className="organizer-dialog__field"><label htmlFor={`${id}-location`}>Local da atividade<RequiredMark /></label><div className="organizer-dialog__input-icon"><img className="organizer-dialog__leading-icon" src="/figma/organizer/665c6.svg" alt="" /><input id={`${id}-location`} required minLength={2} maxLength={240} placeholder="Ex: Laboratório de Informática — Bloco A" value={draft.location} onChange={change => field('location', change.target.value)} /></div></div></section>
      <section className="organizer-dialog__section"><h3>3. Inscrições e Vagas</h3><div className="organizer-dialog__grid"><div className="organizer-dialog__field"><label htmlFor={`${id}-capacity`}>Número de vagas<RequiredMark /></label><div className="activity-capacity"><input id={`${id}-capacity`} type="number" required min={1} max={100000} step={1} value={capacity} onChange={change => setCapacity(change.target.value)} /><span>vagas</span></div></div><label className="activity-waitlist"><input type="checkbox" checked={draft.waitlistEnabled} onChange={change => field('waitlistEnabled', change.target.checked)} /><span className="activity-waitlist__box">{draft.waitlistEnabled && <img src="/figma/organizer/b5bd9.svg" alt="" />}</span><span>Permitir lista de espera</span></label></div>
        {!draft.priceOptions?.length && <div className="activity-payment"><fieldset><legend>Atividade gratuita?<RequiredMark /></legend><div className="activity-payment__choices">{([[true, 'Sim'], [false, 'Não']] as const).map(([value, label]) => <label key={String(value)} className={free === value ? 'selected' : ''}><input type="radio" required name={`${id}-free`} checked={free === value} onChange={() => { setFree(value); setError(''); }} /><span>{label}</span></label>)}</div></fieldset>{!free && <div className="organizer-dialog__field activity-payment__price"><label htmlFor={`${id}-price`}>Valor da inscrição<RequiredMark /></label><div className="organizer-dialog__input-icon"><span className="organizer-dialog__leading-icon">R$</span><input id={`${id}-price`} type="number" required min="0.01" max="100000" step="0.01" value={price} onChange={change => setPrice(change.target.value)} /></div></div>}</div>}
        <PriceOptionsEditor rates={draft.priceOptions || []} eventStart={event.startsAt} onChange={rates => field('priceOptions', rates)} />
      </section>
      </fieldset>
    </OrganizerDialog>
    {addingSpeaker && <SpeakerDialog onClose={() => setAddingSpeaker(false)} onSave={speaker => { setAddedSpeakers(current => [...current, speaker]); onAddSpeaker(speaker); setSelectedSpeaker(speaker.id!); setDraft(current => ({ ...current, responsible: speaker.name, speakerId: speaker.id })); setError(''); }} />}
  </>;
}
