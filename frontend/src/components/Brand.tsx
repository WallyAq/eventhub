import { Link } from 'react-router-dom';

export function Brand({ login = false, to = '/' }: { login?: boolean; to?: string }) {
  return <Link to={to} className={'figma-brand' + (login ? ' figma-brand-login' : '')} aria-label="EventHub — início">
    <img className="brand-logo" src="/figma/eventhub-logo-transparent.png" width={2168} height={725} alt="EventHub" />
  </Link>;
}

