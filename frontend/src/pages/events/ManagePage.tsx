import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BusinessLayout,Feedback,Icon } from '../../components/Business';
import { useData } from '../../services/business';
import type { EventData } from '../../services/business';
import { EventCard,EventFilters } from './CatalogPage';
import './manage.css';

export function ManageEventsPage(){
  const {data,error,loading}=useData<{events:EventData[]}>('/events?managed=true');
  const [query,setQuery]=useState(''),[modality,setModality]=useState(''),[status,setStatus]=useState('');
  const allEvents=data?.events || [];
  const events=allEvents.filter(event=>(!status||event.status===status)&&(!modality||event.modality===modality)&&event.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const firstEvent=!loading&&!error&&!!data&&!allEvents.length;
  const groups=[['Inscrições Abertas',(e:EventData)=>e.status==='PUBLISHED'&&new Date(e.startsAt).getTime()>Date.now()],['Em andamento',(e:EventData)=>e.status==='PUBLISHED'&&new Date(e.startsAt).getTime()<=Date.now()&&new Date(e.endsAt).getTime()>Date.now()],['Rascunhos',(e:EventData)=>e.status==='DRAFT'],['Concluídos',(e:EventData)=>e.status==='PUBLISHED'&&new Date(e.endsAt).getTime()<=Date.now()],['Cancelados',(e:EventData)=>e.status==='CANCELLED']] as const;
  return <BusinessLayout area="organization"><div className="manage-events" data-figma-node="2017:993"><div className="business-heading"><div><h1>Gestão de Cursos e Eventos Acadêmicos</h1><p>Gerencie eventos, atividades e inscrições da sua organização.</p></div><Link className="primary-button" to="/organizacao/eventos/novo">Cadastrar Novo Evento</Link></div><Feedback loading={loading} error={error}/><div className="filter-bar"><EventFilters managed query={query} setQuery={setQuery} modality={modality} setModality={setModality}><select aria-label="Status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Status</option><option value="DRAFT">Rascunho</option><option value="PUBLISHED">Publicado</option><option value="CANCELLED">Cancelado</option></select></EventFilters></div><h2>Eventos da Organização</h2>{groups.map(([title,predicate])=>{const items=events.filter(predicate);return items.length>0&&<details className="event-group" key={title} open><summary>{title}<img src="/figma/4a880.svg" alt=""/></summary><div className="events-grid">{items.map(event=><EventCard key={event.id} event={event} managed/>)}</div></details>;})}
    {firstEvent ? <>
      <section className="manage-first-event" data-testid="manage-first-event" aria-labelledby="manage-first-event-title"><div className="manage-first-event__icon"><Icon file="185f6"/></div><h3 id="manage-first-event-title">Nenhum evento ou curso cadastrado ainda</h3><p>Crie seu primeiro evento, adicione atividades e publique para abrir as inscrições da sua organização.</p><Link className="primary-button" to="/organizacao/eventos/novo">Cadastrar Meu Primeiro Evento</Link></section>
      <section className="manage-onboarding" data-testid="manage-onboarding" aria-labelledby="manage-onboarding-title"><h2 id="manage-onboarding-title">Como funciona a gestão no EventHub</h2><ol><li><span className="manage-onboarding__step" aria-hidden="true">1</span><div><h3>Criar Evento</h3><p>Defina nome, modalidade, local e período do evento.</p></div></li><li><span className="manage-onboarding__step" aria-hidden="true">2</span><div><h3>Configurar Atividades</h3><p>Adicione palestrantes, horários, vagas e valores das atividades.</p></div></li><li><span className="manage-onboarding__step" aria-hidden="true">3</span><div><h3>Publicar e abrir inscrições</h3><p>Revise o rascunho e publique para receber inscrições.</p></div></li></ol></section>
    </> : !loading&&!error&&!!data&&!events.length&&<div className="empty-state manage-search-empty"><h3>Nenhum evento encontrado</h3><p>Nenhum evento corresponde à busca e aos filtros selecionados.</p><button type="button" className="secondary-button" onClick={()=>{setQuery('');setModality('');setStatus('');}}>Limpar filtros</button></div>}
  </div></BusinessLayout>;
}
