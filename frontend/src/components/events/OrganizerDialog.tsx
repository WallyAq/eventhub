import { useId, useLayoutEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './organizer-dialogs.css';

let openDialogs = 0;
let previousOverflow = '';
let previousPadding = '';

function lockScroll() {
  if (openDialogs++ === 0) {
    previousOverflow = document.body.style.overflow;
    previousPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    document.body.style.overflow = 'hidden';
  }
  return () => {
    if (--openDialogs === 0) {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    }
  };
}

type Props = {
  title: string;
  description: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
  closeIcon?: string;
  figmaNode?: string;
};

/** Uses the browser's modal focus trap; portals keep its form outside the event form. */
export function OrganizerDialog({ title, description, onClose, onSubmit, children, footer, className = '', closeIcon = '3b42a', figmaNode }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(), descriptionId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockScroll();
    dialog.showModal();
    return () => {
      dialog.close();
      unlock();
      queueMicrotask(() => { if (!dialog.open && previousFocus?.isConnected) previousFocus.focus(); });
    };
  }, []);
  return createPortal(<dialog ref={ref} className={`organizer-dialog ${className}`} aria-labelledby={titleId} aria-describedby={descriptionId} data-figma-node={figmaNode} onCancel={event => { event.preventDefault(); onClose(); }}>
    <form className="organizer-dialog__form" onSubmit={event => { event.preventDefault(); event.stopPropagation(); onSubmit(event); }}>
      <header className="organizer-dialog__header">
        <div><h2 className="organizer-dialog__title" id={titleId}>{title}</h2><p className="organizer-dialog__description" id={descriptionId}>{description}</p></div>
        <button type="button" className="organizer-dialog__close" aria-label="Fechar modal" onClick={onClose}><img src={`/figma/organizer/${closeIcon}.svg`} alt="" /></button>
      </header>
      <div className="organizer-dialog__body">{children}</div>
      <footer className="organizer-dialog__footer">{footer}</footer>
    </form>
  </dialog>, document.body);
}
