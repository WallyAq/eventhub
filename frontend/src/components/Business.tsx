import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppLayout } from './AppLayout';
import type { AccessArea } from '../auth/access';
import { accountDestination } from '../auth/access';

export function BusinessLayout({children,area='participant'}:{children:ReactNode;area?:AccessArea}){
  const {session}=useAuth();
  if(!session)return <Navigate to={area==='participant'?'/participante/login':'/organizacao/login'} replace/>;
  if(session.user.role!==(area==='organization'?'ORGANIZER':'PARTICIPANT'))return <Navigate to={accountDestination(session.user.role)} replace/>;
  return <AppLayout area={area}><main className="business-main">{children}</main></AppLayout>;
}
export function Feedback({loading,error}:{loading:boolean;error:string}){return <>{loading&&<p role="status">Carregando…</p>}{error&&<p className="error" role="alert">{error}</p>}</>;}
export function Icon({file}:{file:string}){return <img className="business-icon" src={'/figma/'+file+'.svg'} alt=""/>;}
