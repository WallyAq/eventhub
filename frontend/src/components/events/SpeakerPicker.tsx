import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import type { Speaker } from '../../services/business';
import './speaker-picker.css';
import { usePresenceMotion } from '../../motion/usePresenceMotion';

export type SpeakerOption = { value: string; speaker: Speaker; legacy?: boolean };
type Props = {
  id: string;
  options: SpeakerOption[];
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  disabled?: boolean;
  canAdd?: boolean;
  required?: boolean;
};
const searchable = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');

/** The search text is a filter, while value always refers to a saved speaker. */
export function SpeakerPicker({ id, options, value, onChange, onAdd, disabled = false, canAdd = true, required = false }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const previousValue = useRef(value);
  const suppressFocusOpen = useRef(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const popupMotion = usePresenceMotion<HTMLDivElement>(open);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selected = options.find(option => option.value === value);
  const needle = searchable(query.trim());
  const filtered = options.filter(({ speaker }) => searchable(`${speaker.name} ${speaker.institution} ${speaker.degree || ''}`).includes(needle));
  const listId = `${id}-listbox`;
  const activeOption = activeIndex >= 0 && activeIndex < filtered.length ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    setOpen(false); setQuery(''); setActiveIndex(-1);
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || root.current?.contains(target)) return;
      // A nested native dialog owns its own focus and pointer events.
      if (target instanceof Element && target.closest('dialog') && target.closest('dialog') !== root.current?.closest('dialog')) return;
      setOpen(false); setActiveIndex(-1);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open && activeOption) document.getElementById(activeOption)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeOption]);

  function show() {
    if (disabled || suppressFocusOpen.current || input.current?.matches(':disabled')) return;
    setOpen(true);
  }
  function focusInput() {
    suppressFocusOpen.current = true;
    input.current?.focus();
    suppressFocusOpen.current = false;
  }
  function choose(option: SpeakerOption) {
    if (disabled || input.current?.matches(':disabled')) return;
    previousValue.current = option.value;
    onChange(option.value);
    setQuery(''); setOpen(false); setActiveIndex(-1);
    focusInput();
  }
  function changeSpeaker() {
    if (disabled || input.current?.matches(':disabled')) return;
    setQuery(''); setActiveIndex(-1); setOpen(true);
    input.current?.focus();
  }
  function clear() {
    if (disabled || input.current?.matches(':disabled')) return;
    previousValue.current = '';
    onChange(''); setQuery(''); setActiveIndex(-1); setOpen(true);
    input.current?.focus();
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const count = filtered.length;
      if (!count) return setActiveIndex(-1);
      setActiveIndex(current => event.key === 'ArrowDown' ? (current + 1 + count) % count : current < 0 ? count - 1 : (current - 1 + count) % count);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault(); event.stopPropagation();
      const option = filtered[activeIndex >= 0 ? activeIndex : 0];
      if (option) choose(option);
    }
  }
  function escape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation();
      setOpen(false); setActiveIndex(-1);
      focusInput();
    }
  }
  function blur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (!(next instanceof Element) || root.current?.contains(next)) return;
    if (next.closest('dialog') && next.closest('dialog') !== root.current?.closest('dialog')) return;
    setOpen(false); setActiveIndex(-1);
  }

  return <div className="speaker-picker" ref={root} onKeyDown={escape} onBlur={blur}>
    {selected && <div className="speaker-picker__selected" data-testid="speaker-selected">
      <div className="speaker-picker__selected-info" id={`${id}-selected-info`}><strong>{selected.speaker.name}</strong><small>{selected.speaker.institution || (selected.legacy ? 'Responsável do cadastro anterior' : 'Instituição não informada')}</small></div>
      <div className="speaker-picker__selected-actions"><button type="button" className="speaker-picker__swap" disabled={disabled} onClick={changeSpeaker}>Trocar docente</button><button type="button" className="speaker-picker__remove" aria-label="Desvincular docente" title="Desvincular da atividade" disabled={disabled} onClick={clear}><img src="/figma/organizer/3b42a.svg" alt="" /></button></div>
    </div>}
    <div className={`speaker-picker__search${open ? ' is-open' : ''}`}>
      <img className="speaker-picker__search-icon" src="/figma/organizer/82d43.svg" alt="" />
      <input ref={input} id={id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open ? activeOption : undefined} aria-required={required || undefined} aria-describedby={selected ? `${id}-selected-info` : undefined} autoComplete="off" disabled={disabled} placeholder="Busque por nome, instituição ou titulação" value={query} onFocus={show} onClick={show} onKeyDown={keyDown} onChange={event => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); }} />
      <button type="button" className="speaker-picker__toggle" aria-label={open ? 'Fechar lista de docentes' : 'Abrir lista de docentes'} tabIndex={-1} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => { if (open) { setOpen(false); setActiveIndex(-1); } else { show(); input.current?.focus(); } }}><img src="/figma/organizer/401ce.svg" alt="" /></button>
    </div>
    {popupMotion.rendered && <div ref={popupMotion.ref} className="speaker-picker__popup" inert={!open}>
      <div className="speaker-picker__results"><span aria-live="polite">{filtered.length} {filtered.length === 1 ? 'docente encontrado' : 'docentes encontrados'}</span><small>Pressione Enter para selecionar</small></div>
      <div className="speaker-picker__options" id={listId} role="listbox" aria-label="Docentes disponíveis">
        {filtered.length ? filtered.map((option, index) => <button type="button" role="option" id={`${id}-option-${index}`} key={option.value} aria-selected={option.value === value} className={`speaker-picker__option${index === activeIndex ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`} tabIndex={-1} disabled={disabled} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>
          <span className="speaker-picker__option-info"><strong>{option.speaker.name}</strong><small>{option.speaker.institution || (option.legacy ? 'Responsável do cadastro anterior' : 'Instituição não informada')}</small></span>
        </button>) : <div className="speaker-picker__empty"><strong>{options.length ? 'Nenhum docente corresponde à busca.' : 'Nenhum docente cadastrado neste evento.'}</strong><p>{options.length ? 'Tente outro nome, instituição ou titulação, ou cadastre um novo docente abaixo.' : 'Cadastre um professor ou palestrante para vincular esta atividade.'}</p></div>}
      </div>
      <div className="speaker-picker__footer"><span>Não encontrou na lista?</span><button type="button" disabled={disabled || !canAdd} onClick={onAdd}>Cadastrar novo docente agora</button>{!canAdd && <small>O evento já possui o limite de 30 docentes.</small>}</div>
    </div>}
  </div>;
}
