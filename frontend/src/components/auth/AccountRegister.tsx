import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../AuthLayout';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage, registerParticipant } from '../../services/identity';
import { accessAreas } from '../../auth/access';
import type { AccessArea } from '../../auth/access';

export function AccountRegister({ area }: { area: AccessArea }) {
  const access = accessAreas[area];
  const { session } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to={access.destination} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password !== confirmation) { setError('As senhas devem ser iguais.'); return; }
    setBusy(true);
    try {
      await registerParticipant(name, email, password);
      setPassword(''); setConfirmation('');
      navigate(access.login, { replace: true, state: { registered: true } });
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <AuthLayout area={area}><section className="status-panel auth-panel" aria-labelledby="register-title">
    <span className="eyebrow">{access.eyebrow}</span><h2 id="register-title">{access.registerTitle}</h2>
    <p>{access.registerDescription}</p>
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
      <label htmlFor="register-name">{area === 'organization' ? 'Nome do responsável' : 'Seu nome'}</label>
      <input id="register-name" name="name" autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} />
      <label htmlFor="register-email">E-mail</label>
      <input id="register-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="register-password">Senha</label>
      <input id="register-password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby="password-hint" value={password} onChange={e => setPassword(e.target.value)} />
      <small id="password-hint">Use entre 8 e 128 caracteres.</small>
      <label htmlFor="register-confirmation">Confirme sua senha</label>
      <input id="register-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit">{busy ? 'Criando conta…' : area === 'organization' ? 'Cadastrar responsável' : 'Criar conta de participante'}<span aria-hidden="true">↗</span></button>
    </fieldset></form>
    <p className="auth-switch">Já tem conta? <Link to={access.login}>Entrar{area === 'organization' ? ' e acessar ou criar sua organização' : ''}</Link></p>
  </section></AuthLayout>;
}

