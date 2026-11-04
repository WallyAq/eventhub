import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { Speaker } from '../../services/business';
import { OrganizerDialog } from './OrganizerDialog';

const degrees = ['Graduação', 'Pós-Graduação', 'Mestrado', 'Doutorado', 'PhD'];
type Props = { speaker?: Speaker; onSave: (speaker: Speaker) => void; onClose: () => void };

export function SpeakerDialog({ speaker, onSave, onClose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(() => ({ name: speaker?.name ?? '', degree: speaker?.degree ?? '', institution: speaker?.institution ?? '', email: speaker?.email ?? '', biography: speaker?.biography ?? '' }));
  const [error, setError] = useState('');
  function field(key: keyof typeof draft, value: string) { setDraft(current => ({ ...current, [key]: value })); setError(''); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = { ...draft, name: draft.name.trim(), institution: draft.institution.trim(), email: draft.email.trim(), biography: draft.biography.trim() };
    if (value.name.length < 2 || value.name.length > 120) return setError('Informe um nome com 2 a 120 caracteres.');
    if (!degrees.includes(value.degree)) return setError('Selecione a titulação acadêmica.');
    if (value.institution.length < 2 || value.institution.length > 160) return setError('Informe uma instituição com 2 a 160 caracteres.');
    if (value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return setError('Informe um e-mail de contato válido.');
    if (value.biography.length > 400) return setError('A mini-biografia deve ter até 400 caracteres.');
    onSave({ ...speaker, ...value, id: speaker?.id || crypto.randomUUID() });
    onClose();
  }
  return <OrganizerDialog title={speaker ? 'Editar Professor/Palestrante' : 'Cadastrar Professor/Palestrante'} description="Homologue palestrantes e docentes para vinculá-los às atividades, workshops e emissão de certificados." onClose={onClose} onSubmit={submit} className="speaker-dialog" closeIcon="79090" figmaNode="2053:2773" footer={<><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Salvar</button></>}>
    {error && <p className="organizer-dialog__error" role="alert">{error}</p>}
    <div className="organizer-dialog__grid">
      <div className="organizer-dialog__field"><label htmlFor={`${id}-name`}>Nome Completo<span className="organizer-dialog__required">*</span></label><input id={`${id}-name`} required minLength={2} maxLength={120} autoComplete="name" placeholder="Ex: Dra. Helena Duarte" value={draft.name} onChange={event => field('name', event.target.value)} /></div>
      <div className="organizer-dialog__field"><label htmlFor={`${id}-degree`}>Titulação/Cargo Acadêmico<span className="organizer-dialog__required">*</span></label><div className="organizer-dialog__select"><select id={`${id}-degree`} required value={draft.degree} onChange={event => field('degree', event.target.value)}><option value="">Selecione a titulação...</option>{degrees.map(degree => <option key={degree}>{degree}</option>)}</select><img src="/figma/organizer/401ce.svg" alt="" /></div></div>
      <div className="organizer-dialog__field"><label htmlFor={`${id}-institution`}>Instituição de Origem/Afiliação<span className="organizer-dialog__required">*</span></label><input id={`${id}-institution`} required minLength={2} maxLength={160} autoComplete="organization" placeholder="Ex: MIT Quantum Lab, USP, INPE" value={draft.institution} onChange={event => field('institution', event.target.value)} /></div>
      <div className="organizer-dialog__field"><label htmlFor={`${id}-email`}>E-mail Institucional ou de Contato<span className="organizer-dialog__required">*</span></label><input id={`${id}-email`} type="email" required maxLength={254} autoComplete="email" placeholder="docente@universidade.edu.br" value={draft.email} onChange={event => field('email', event.target.value)} /></div>
    </div>
    <div className="organizer-dialog__field"><div className="organizer-dialog__label-row"><label htmlFor={`${id}-bio`}>Mini-biografia/Apresentação</label><span id={`${id}-count`} className="organizer-dialog__counter">{draft.biography.length} / 400</span></div><textarea id={`${id}-bio`} maxLength={400} rows={3} aria-describedby={`${id}-count`} placeholder="Resumo curricular para divulgação na programação do evento e aplicativo oficial dos congressistas..." value={draft.biography} onChange={event => field('biography', event.target.value)} /></div>
  </OrganizerDialog>;
}
