import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BusinessLayout, Feedback, Icon } from '../../components/Business';
import { useData, money } from '../../services/business';
import type { EventData } from '../../services/business';
import './catalog.css';

const PAGE_SIZE = 6;
const localeDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Fortaleza' });
const dayDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Fortaleza' });
const monthDate = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Fortaleza' });

function eventDate(event: EventData) {
  const start = new Date(event.startsAt), end = new Date(event.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'Data a definir';
  if (localeDate.format(start) === localeDate.format(end)) return localeDate.format(start);
  return monthDate.format(start) === monthDate.format(end)
    ? `${dayDate.format(start)} a ${dayDate.format(end)} de ${monthDate.format(end)}`
    : `${localeDate.format(start)} a ${localeDate.format(end)}`;
}

function eventPrice(event: EventData) {
  const prices = event.activities.map(item => item.priceCents).filter(value => Number.isSafeInteger(value) && value >= 0);
  if (!prices.length) return 'Consulte a programação';
  const min = Math.min(...prices), max = Math.max(...prices);
  if (min === 0 && max === 0) return 'Gratuito';
  return min === max ? money(min) : `${min === 0 ? 'Gratuito' : money(min)} – ${money(max)}`;
}

function modalityLabel(value: string) { return value === 'Online' ? 'Remoto' : value; }
function normalized(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim(); }

export function EventCard({ event, managed = false }: { event: EventData; managed?: boolean }) {
  const frequency = managed && event.status === 'PUBLISHED' && new Date(event.endsAt).getTime() > Date.now();
  return <article className={managed ? 'event-card managed-event' : 'event-card participant-event-card'}>
    <h3>{event.title}</h3><p className="event-description">{event.description}</p>
    <div className="event-meta">
      {!managed && <p><Icon file="a7cf1" />Instituição: {event.organizationName}</p>}
      <p>{managed ? <img src="/figma/official/ed882.svg" alt="" /> : <Icon file="ed882" />}{managed ? event.modality : modalityLabel(event.modality)} · {event.location || 'Plataforma online'}</p>
      <p>{managed ? <img src="/figma/official/46b9b.svg" alt="" /> : <Icon file="46b9b" />}{eventDate(event)} · Carga horária: {event.hours}h</p>
    </div>
    {!managed && <p className="event-price">{eventPrice(event)}</p>}
    <div className="card-actions">{managed
      ? <><Link className={frequency ? 'secondary-button' : 'primary-button'} to={'/organizacao/eventos/' + event.id + '/gestao'}>Gerenciar Evento</Link>{frequency && <Link className="primary-button" to={'/organizacao/eventos/' + event.id + '/gestao?aba=atividades'}>Abrir Frequência</Link>}</>
      : <><Link className="primary-button" to={'/eventos/' + event.id + '/inscricao'}>Inscreva-se</Link><Link className="secondary-button" to={'/eventos/' + event.id}>Detalhes do Evento</Link></>}
    </div>
  </article>;
}

export function EventFilters({ query, setQuery, modality, setModality, managed = false, children }: { query: string; setQuery: (value: string) => void; modality: string; setModality: (value: string) => void; managed?: boolean; children?: ReactNode }) {
  const modalities = managed ? ['Presencial', 'Híbrido', 'Online'] : ['Presencial', 'Online', 'Híbrido'];
  return <><div className="search-field">{managed ? <img src="/figma/official/b6a5d.svg" alt="" /> : <Icon file="3f6b7" />}<input aria-label="Buscar eventos" placeholder={managed ? 'Buscar por nome do evento...' : 'Nome do evento ou instituição...'} value={query} onChange={event => setQuery(event.target.value)} /></div>{children}<select aria-label="Modalidade" value={modality} onChange={event => setModality(event.target.value)}><option value="">Modalidade</option>{modalities.map(value => <option key={value} value={value}>{managed ? value : modalityLabel(value)}</option>)}</select></>;
}

function pageNumbers(current: number, pages: number) {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const nearby = current <= 3 ? [1, 2, 3] : current >= pages - 2 ? [pages - 2, pages - 1, pages] : [current - 1, current, current + 1];
  return [...new Set([1, ...nearby, pages])].sort((a, b) => a - b);
}

export function CatalogPage() {
  const { data, error, loading, reload } = useData<{ events: EventData[] }>('/events');
  const [query, setQuery] = useState(''), [modality, setModality] = useState(''), [page, setPage] = useState(1);
  const open = (data?.events || []).filter(event => event.status === 'PUBLISHED' && new Date(event.startsAt).getTime() > Date.now());
  const featured = open.find(event => event.featured);
  const events = open.filter(event => (!modality || event.modality === modality) && normalized(event.title + ' ' + event.organizationName).includes(normalized(query)));
  const pages = Math.max(1, Math.ceil(events.length / PAGE_SIZE)), current = Math.min(page, pages);
  const visible = events.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), numbers = pageNumbers(current, pages);
  return <BusinessLayout><div className="participant-catalog">
    <Feedback loading={loading} error={error} />
    {error && <button type="button" className="secondary-button" onClick={reload}>Tentar novamente</button>}
    {!loading && !error && <>
      {featured && <section className="participant-featured" aria-labelledby="featured-title"><h2 id="featured-title">Congresso em Destaque</h2><article className="participant-featured-card">
        <h1>{featured.title}</h1><p className="participant-featured-description">{featured.description}</p>
        <dl className="participant-featured-meta"><div><dt>Data do Evento</dt><dd>{eventDate(featured)}</dd></div><div><dt>Carga Horária</dt><dd>{featured.hours}h</dd></div><div><dt>Modalidade</dt><dd>{modalityLabel(featured.modality)}</dd></div><div><dt>Valores</dt><dd>{eventPrice(featured)}</dd></div></dl>
        <div className="card-actions"><Link className="primary-button" to={'/eventos/' + featured.id + '/inscricao'}>Inscreva-se</Link><Link className="secondary-button" to={'/eventos/' + featured.id}>Detalhes do Evento</Link></div>
      </article></section>}
      <section className="participant-event-list" data-figma-node="2012:222" aria-labelledby="catalog-title"><h2 id="catalog-title">Eventos com Inscrições Abertas</h2>
        <div className="filter-bar"><EventFilters query={query} setQuery={value => { setQuery(value); setPage(1); }} modality={modality} setModality={value => { setModality(value); setPage(1); }} /></div>
        <div className="events-grid">{visible.map(event => <EventCard key={event.id} event={event} />)}</div>
        {!events.length && <div className="empty-state"><h3>Nenhum evento encontrado</h3><p>{query || modality ? 'Nenhum evento corresponde à busca e aos filtros selecionados.' : 'Os eventos publicados pelas organizações aparecerão aqui.'}</p>{(query || modality) && <button type="button" className="secondary-button" onClick={() => { setQuery(''); setModality(''); setPage(1); }}>Limpar filtros</button>}</div>}
        <div className="participant-pagination"><p role="status">{events.length ? <>Mostrando <strong>{(current - 1) * PAGE_SIZE + 1} a {Math.min(current * PAGE_SIZE, events.length)}</strong> de <strong>{events.length}</strong> eventos acadêmicos</> : 'Nenhum evento disponível'}</p>
          {pages > 1 && <nav aria-label="Páginas de eventos"><button type="button" aria-label="Página anterior" disabled={current === 1} onClick={() => setPage(current - 1)}>‹</button>{numbers.map((number, index) => <span className="participant-pagination-item" key={number}>{index > 0 && number - numbers[index - 1] > 1 && <span className="participant-pagination-gap" aria-hidden="true">…</span>}<button type="button" aria-label={'Página ' + number} aria-current={number === current ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button></span>)}<button type="button" aria-label="Próxima página" disabled={current === pages} onClick={() => setPage(current + 1)}>›</button></nav>}
        </div>
      </section>
    </>}
  </div></BusinessLayout>;
}
