import type { ActivityAvailability } from '../../services/availability';

export function ActivitySeats({ availability, loading }: { availability?: ActivityAvailability; loading: boolean }) {
  return <span className="activity-seats">
    {availability ? <><strong>Vagas disponíveis: {availability.availableSeats}</strong><span> de {availability.capacity}</span></> : loading ? 'Consultando vagas disponíveis…' : 'Vagas disponíveis: consulta indisponível'}
  </span>;
}
