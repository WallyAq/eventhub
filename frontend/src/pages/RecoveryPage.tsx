import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { PasswordInput } from '../components/form/PasswordInput';
import { errorMessage, identityRequest } from '../services/identity';

export function RecoveryPage({ reset=false }: {reset?:boolean}) {
  const location=useLocation();
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  // The fragment keeps the token out of HTTP requests and referrer URLs.
  const [token]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('token') || '');
  const login=new URLSearchParams(location.search).get('area')==='organization' ? '/organizacao/login' : '/participante/login';
  async function submit(event:FormEvent) {
    event.preventDefault();setError('');setMessage('');
    if(reset && password!==confirm){setError('As senhas devem ser iguais.');return;}
    setBusy(true);
    try {const data=await identityRequest('/auth/password/'+(reset?'reset':'forgot'),'POST',reset?{token,password}:{email});setMessage(String(data.message));setPassword('');setConfirm('');}
    catch(error){setError(errorMessage(error));}finally{setBusy(false);}
  }
  return <main className="recovery-page"><section className="recovery-card" data-figma-node="2001:42"><div className="auth-heading"><h1>{reset?'Redefinir sua senha':'Recuperar sua senha'}</h1><p>{reset?'Escolha uma nova senha para sua conta.':'Informe o e-mail cadastrado na sua conta de participante ou organizador para receber o link de redefinição de acesso.'}</p></div>
    <form onSubmit={submit}><fieldset disabled={busy || (reset && !!message)}>{reset?<><div className="form-field"><label htmlFor="reset-password">Nova senha</label><PasswordInput id="reset-password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></div><div className="form-field"><label htmlFor="reset-confirm">Confirmar nova senha</label><PasswordInput id="reset-confirm" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></div></>:<><div className="form-field"><label htmlFor="recovery-email">E-mail cadastrado</label><input id="recovery-email" type="email" required maxLength={254} autoComplete="email" placeholder="seu.email@instituicao.com.br" value={email} onChange={e=>setEmail(e.target.value)}/></div><p className="recovery-note"><img src="/figma/799ad.svg" alt=""/>Enviaremos um link de uso único válido por 30 minutos.</p></>}
      {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="success" role="status">{message}</p>}<button className="primary-button" type="submit">{busy?'Processando…':reset?'Redefinir senha':'Enviar link de recuperação'}</button></fieldset></form><div className="auth-card-footer">Lembrou sua senha? <Link to={login}>Fazer login</Link></div></section><Brand login/></main>;
}
