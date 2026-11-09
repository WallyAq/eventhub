import { useLayoutEffect, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export type InputMask = 'cpf' | 'cnpj' | 'phone';

export function unmask(value: string, mask: InputMask) {
  return mask === 'cnpj'
    ? value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 14)
    : value.replace(/\D/g, '').slice(0, mask === 'cpf' ? 11 : 15);
}

function template(value: string, pattern: string) {
  let result = '', index = 0;
  for (const character of pattern) {
    if (index >= value.length) break;
    result += character === '#' ? value[index++] : character;
  }
  return result;
}

export function formatInput(value: string, mask: InputMask): string {
  const raw = unmask(value, mask);
  if (!raw) return '';
  if (mask === 'cpf') return template(raw, '###.###.###-##');
  if (mask === 'cnpj') return template(raw, '##.###.###/####-##');
  // Preserve international numbers already supported by the API.
  if (raw.length > 11) {
    if (raw.startsWith('55') && raw.length <= 13) return '+55 ' + formatInput(raw.slice(2), 'phone');
    return '+' + raw;
  }
  return template(raw, raw.length <= 10 ? '(##) ####-####' : '(##) #####-####');
}

function caretPosition(formatted: string, count: number, mask: InputMask) {
  if (count === 0) return 0;
  const character = mask === 'cnpj' ? /[a-z0-9]/i : /\d/;
  for (let index = 0, found = 0; index < formatted.length; index++) {
    if (character.test(formatted[index]) && ++found === count) return index + 1;
  }
  return formatted.length;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'maxLength' | 'onKeyDown'> & {
  mask: InputMask;
  value: string;
  onValueChange: (value: string) => void;
};

/** Display punctuation while keeping the parent's value in the API's raw format. */
export function MaskedInput({ mask, value, onValueChange, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const formatted = formatInput(value, mask);

  function update(element: HTMLInputElement, raw: string, count: number) {
    const next = formatInput(raw, mask);
    const caret = caretPosition(next, count, mask);
    // Also restore the DOM when invalid input leaves the React value unchanged.
    element.value = next;
    element.setSelectionRange(caret, caret);
    pendingCaret.current = raw !== unmask(value, mask) ? caret : null;
    onValueChange(raw);
  }

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && input.current && input.current === document.activeElement) {
      input.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  });

  return <input {...props} ref={input} type={mask === 'phone' ? 'tel' : 'text'}
    inputMode={mask === 'cnpj' ? 'text' : 'numeric'} value={formatted}
    onChange={event => {
      const element = event.currentTarget;
      const count = unmask(element.value.slice(0, element.selectionStart ?? element.value.length), mask).length;
      const raw = unmask(element.value, mask);
      const inputType = (event.nativeEvent as InputEvent).inputType;
      // Virtual keyboards can delete punctuation without sending a keydown.
      if (raw === unmask(value, mask) && ['deleteContentBackward', 'deleteContentForward'].includes(inputType)) {
        const index = inputType === 'deleteContentBackward' ? count - 1 : count;
        if (index >= 0 && index < raw.length) {
          update(element, raw.slice(0, index) + raw.slice(index + 1), index);
          return;
        }
      }
      update(element, raw, count);
    }}
    onKeyDown={event => {
      if (!['Backspace', 'Delete'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
      const element = event.currentTarget;
      if (element.selectionStart !== element.selectionEnd) return;
      const count = unmask(element.value.slice(0, element.selectionStart ?? 0), mask).length;
      const index = event.key === 'Backspace' ? count - 1 : count;
      const raw = unmask(element.value, mask);
      if (index < 0 || index >= raw.length) return;
      event.preventDefault();
      update(element, raw.slice(0, index) + raw.slice(index + 1), index);
    }} />;
}
