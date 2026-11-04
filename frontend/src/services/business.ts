import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { identityRequest, errorMessage } from './identity';

export type Activity={id:string;title:string;startsAt:string;endsAt:string;location:string;responsible:string;capacity:number;priceCents:number;kind?:'Curso'|'Minicurso'|'Workshop'|'Palestra';description?:string;waitlistEnabled?:boolean;speakerId?:string|null};
export type Speaker={id?:string;name:string;institution:string;degree?:string;email?:string;biography?:string};
export type EventData={id:string;organizationId:string;organizationName:string;title:string;description:string;category:string;hours:number;modality:string;location:string;streamUrl:string;startsAt:string;endsAt:string;sessionTime:string;featured:boolean;speakers:Speaker[];activities:Activity[];status:'DRAFT'|'PUBLISHED'|'CANCELLED'};
export type Registration={id:string;userId:string;activityId:string;eventId:string;eventTitle:string;activity:Activity;priceCents:number;status:'PENDING_PAYMENT'|'CONFIRMED'|'CANCELLED'|'EXPIRED'|'WAITLISTED';expiresAt:string|null;createdAt:string};
export type Payment={registrationId:string;amountCents:number;status:'PENDING'|'APPROVED'|'DECLINED'|'EXPIRED'};
export async function api<T>(path:string,token?:string,method='GET',body?:unknown):Promise<T>{return await identityRequest(path,method,body,token) as unknown as T;}
export async function reserve(token:string,eventId:string,activityId:string,key:string):Promise<Registration>{
  const response=await fetch('/api/registrations',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({eventId,activityId}),signal:AbortSignal.timeout(20000)});
  const data=await response.json(); if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:data.message || 'Não foi possível reservar. Tente novamente.');return data.registration;
}
export function useData<T>(path:string){
  const {session}=useAuth(),token=session?.token;
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');api<T>(path,token).then(value=>{if(active)setData(value);}).catch(error=>{if(active)setError(errorMessage(error));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[path,token,version]);
  return {data,error,loading,reload:()=>setVersion(value=>value+1)};
}
export const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Fortaleza'});
export const statusLabel:Record<string,string>={DRAFT:'Rascunho',PUBLISHED:'Publicado',CANCELLED:'Cancelada',PENDING_PAYMENT:'Aguardando pagamento',CONFIRMED:'Confirmada',EXPIRED:'Expirada',WAITLISTED:'Lista de espera',PENDING:'Processando',APPROVED:'Aprovado',DECLINED:'Recusado'};
