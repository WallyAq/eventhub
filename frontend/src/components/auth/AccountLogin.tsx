import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../AuthLayout';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage, login } from '../../services/identity';
import { accessAreas } from '../../auth/access';
import type { AccessArea } from '../../auth/access';

export function AccountLogin({ area }: { area: AccessArea }) {
  const access = accessAreas[area];
  const other = accessAreas[access.other];
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (auth.session) return <Navigate to={access.destination} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { auth.signIn(await login(email, password)); setPassword(''); navigate(access.destination, { replace: true }); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <AuthLayout area={area}><section className="status-panel auth-panel" aria-labelledby="login-title">
    <span className="eyebrow">{access.eyebrow}</span>
    <h2 id="login-title">{access.title}</h2><p>{access.description}</p>
    {area === 'organization' && <p className="organization-login-note">Se sua equipe já adicionou você, use o e-mail cadastrado. Se estiver começando, você poderá criar sua primeira organização após entrar.</p>}
    {location.state?.registered && <p className="success" role="status">Conta criada. Entre com seu e-mail e senha.</p>}
    {auth.notice && <p role="status">{auth.notice}</p>}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}>
        <label htmlFor="login-email">E-mail</label>
        <input id="login-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="login-password">Senha</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit">{busy ? 'Entrando…' : area === 'organization' ? 'Entrar na organização' : 'Entrar como participante'}<span aria-hidden="true">↗</span></button>
      </fieldset>
    </form>
    <p className="auth-switch">Ainda não tem conta? <Link to={access.register}>{area === 'organization' ? 'Cadastrar responsável' : 'Cadastrar participante'}</Link></p>
    <p className="auth-switch area-switch"><Link to={other.login}>Ir para o acesso de {other.label.toLowerCase()}</Link></p>
  </section></AuthLayout>;
}

