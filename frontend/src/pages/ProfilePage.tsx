import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { useAuth } from '../auth/AuthContext';
import { ApiError, errorMessage, getProfile, updateProfile } from '../services/identity';

export function ProfilePage() {
  const { session, setUser, signOut } = useAuth();
  const token = session?.token;
  const [name, setName] = useState(session?.user.name || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    getProfile(token, controller.signal).then(user => {
      if (!controller.signal.aborted) { setUser(user); setName(user.name); }
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) signOut('Sua sessão terminou. Entre novamente.');
      else setError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, setUser, signOut]);
  if (!session) return <Navigate to="/participante/login" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const user = await updateProfile(token, name);
      setUser(user); setName(user.name); setSuccess('Nome atualizado.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) signOut('Sua sessão terminou. Entre novamente.');
      else setError(errorMessage(error));
    } finally { setBusy(false); }
  }
  return <AuthLayout><section className="status-panel auth-panel" aria-labelledby="profile-title">
    <span className="eyebrow">MINHA CONTA</span><h2 id="profile-title">Seu perfil</h2>
    <p>Gerencie seus dados de participante.</p>
    {loading && <p role="status">Carregando perfil…</p>}
    <dl className="profile-details"><dt>E-mail</dt><dd>{session.user.email}</dd><dt>Perfil</dt><dd>Participante</dd></dl>
    <form onSubmit={submit} aria-busy={busy || loading}><fieldset disabled={busy || loading}>
      <label htmlFor="profile-name">Nome</label>
      <input id="profile-name" name="name" autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} />
      {success && <p className="success" role="status">{success}</p>}
      <button type="submit">{busy ? 'Salvando…' : 'Salvar nome'}<span aria-hidden="true">↗</span></button>
    </fieldset></form>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="auth-switch"><Link to="/organizacao/login">Ir para a área da organização</Link></p>
    <button type="button" className="secondary-button" onClick={() => signOut()}>Sair da conta</button>
    <p className="note">Por enquanto, a sessão fica ativa apenas nesta aba e termina ao atualizar a página.</p>
  </section></AuthLayout>;
}

