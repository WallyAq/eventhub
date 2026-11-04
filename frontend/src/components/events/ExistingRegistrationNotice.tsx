import { Link } from 'react-router-dom';
import type { Registration } from '../../services/business';
import { registrationAction, registrationNotice } from '../../services/eventRegistrations';
import './existing-registration.css';

export function ExistingRegistrationNotice({ registration, showLink = true }: { registration: Registration; showLink?: boolean }) {
  const destination = registration.status === 'CONFIRMED' ? '/inscricoes/' : '/pagamento/';
  return <div role="status" className="existing-registration-notice">
    <p>{registrationNotice(registration)}</p>
    {showLink && <Link className="primary-button" to={destination + registration.id}>{registrationAction(registration)}</Link>}
  </div>;
}
