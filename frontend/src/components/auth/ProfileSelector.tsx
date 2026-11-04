import { Link } from 'react-router-dom';
import type { AccessArea } from '../../auth/access';
import { accessAreas } from '../../auth/access';

export function ProfileSelector({ area }: { area: AccessArea }) {
  return <div className="profile-selector"><span className="field-label">Tipo de perfil</span><nav aria-label="Tipo de perfil">
    <Link to={accessAreas.participant.register} aria-current={area === 'participant' ? 'page' : undefined}>
      <img src={'/figma/' + (area === 'participant' ? 'df198.svg' : '3509c.svg')} alt="" />Participante
    </Link>
    <Link to={accessAreas.organization.register} aria-current={area === 'organization' ? 'page' : undefined}>
      <img src={'/figma/' + (area === 'organization' ? '9d4e6.svg' : '0bd4f.svg')} alt="" />Organizador
    </Link>
  </nav></div>;
}

