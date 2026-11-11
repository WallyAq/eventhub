import { Link } from 'react-router-dom';

export function Brand({ login = false, to = '/', design, symbol }: { login?: boolean; to?: string; design?: 'white' | 'blue'; symbol?: string }) {
  return <Link to={to} className={'figma-brand' + (login ? ' figma-brand-login' : '') + (design ? ' figma-brand-design figma-brand-' + design : '')} aria-label="EventHub — início">
    {design ? <><img className="brand-symbol" src={'/figma/official/' + (symbol || (design === 'white' ? 'c4f15.svg' : login ? '954f2.svg' : '94c1a.svg'))} alt="" /><span className="brand-word">Event<span>Hub</span></span><span className="brand-tagline">CONNECT. PARTICIPATE. EXPERIENCE.</span></> : <img className="brand-logo" src="/figma/eventhub-logo-transparent.png" width={2168} height={725} alt="EventHub" />}
  </Link>;
}

