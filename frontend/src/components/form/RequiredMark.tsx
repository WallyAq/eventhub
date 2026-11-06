/** Native required/aria-required on the control provides the accessible semantics. */
export function RequiredMark({ required = true }: { required?: boolean }) {
  return required ? <span className="required-mark" aria-hidden="true" /> : null;
}
