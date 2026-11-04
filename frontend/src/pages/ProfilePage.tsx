import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { PasswordSection } from '../components/profile/PasswordSection';
import { useAuth } from '../auth/AuthContext';
import { ApiError, errorMessage, getProfile, updateProfile } from '../services/identity';
import type { User } from '../types/auth';
import './participant-profile.css';

function displayCpf(value?: string | null) {
  const digits = value?.replace(/\D/g, '') || '';
  return digits.length === 11 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : value || 'Não informado';
}

function displayPhone(value?: string | null) {
  const digits = value?.replace(/\D/g, '') || '';
  return digits.length === 10 || digits.length === 11 ? `(${digits.slice(0, 2)}) ${digits.slice(2, -4)}-${digits.slice(-4)}` : value || 'Não informado';
}

export function ProfilePage() {
  const { session, setUser, signOut } = useAuth();
  const token = session?.token;
  const [profile, setProfile] = useState<User | null>(null);
  const [name, setName] = useState(''), [cpf, setCpf] = useState(''), [phone, setPhone] = useState('');
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false), [passwordOpen, setPasswordOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const saving = useRef(false), currentToken = useRef(token), mounted = useRef(true), saveEpoch = useRef(0);
  currentToken.current = token;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    saveEpoch.current += 1; saving.current = false;
    setLoading(true); setBusy(false); setError(''); setSuccess(''); setProfile(null); setEditing(false); setPasswordOpen(false);
    getProfile(token, controller.signal).then(user => {
      if (controller.signal.aborted) return;
      setUser(user); setProfile(user); setName(user.name); setCpf(user.cpf || ''); setPhone(user.phone || '');
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) signOut('Sua sessão terminou. Entre novamente.');
      else setError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, setUser, signOut, retry]);
  if (!session) return <Navigate to="/participante/login" replace />;

  function restoreFields(user: User) {
    setName(user.name); setCpf(user.cpf || ''); setPhone(user.phone || '');
  }
  function editProfile() {
    if (!profile || busy) return;
    restoreFields(profile); setError(''); setSuccess(''); setEditing(true);
  }
  function cancelEditing() {
    if (!profile || saving.current) return;
    restoreFields(profile); setError(''); setSuccess(''); setEditing(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !profile || saving.current) return;
    const requestToken = token;
    const requestEpoch = saveEpoch.current;
    saving.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      const user = await updateProfile(requestToken, name, { cpf, phone });
      if (!mounted.current || currentToken.current !== requestToken || saveEpoch.current !== requestEpoch) return;
      setUser(user); setProfile(user); restoreFields(user); setEditing(false); setSuccess('Dados atualizados.');
    } catch (error) {
      if (!mounted.current || currentToken.current !== requestToken || saveEpoch.current !== requestEpoch) return;
      if (error instanceof ApiError && error.status === 401) signOut('Sua sessão terminou. Entre novamente.');
      else setError(errorMessage(error));
    } finally {
      if (saveEpoch.current === requestEpoch) {
        saving.current = false;
        if (mounted.current && currentToken.current === requestToken) setBusy(false);
      }
    }
  }

  return <AppLayout><main className="profile-main participant-profile" data-figma-node="2023:1399">
    <div className="page-heading"><h1>Meu Perfil</h1><p>Gerencie suas informações básicas de identificação e segurança de acesso.</p></div>
    {loading && <p role="status" className="info">Carregando perfil…</p>}
    {error && <p className="error participant-profile__feedback" role="alert">{error}</p>}
    {!loading && !profile && error && <button className="secondary-button" type="button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>}
    {profile && <div className="profile-card participant-profile__card">
      <section aria-labelledby="participant-account-heading">
        <header className="participant-profile__section-header"><h2 id="participant-account-heading" className="section-heading"><img src="/figma/98116.svg" alt="" />{editing ? 'Dados Pessoais' : 'Dados da Conta'}</h2></header>
        {editing ? <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
          <div className="participant-profile__fields">
            <div className="form-field"><label htmlFor="profile-name">Nome completo</label><input id="profile-name" autoFocus autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="form-field"><label htmlFor="profile-cpf">CPF</label><input id="profile-cpf" inputMode="numeric" maxLength={14} placeholder="123.456.789-10" value={cpf} onChange={e => setCpf(e.target.value)} /></div>
            <div className="form-field"><label htmlFor="profile-phone">Telefone</label><input id="profile-phone" type="tel" autoComplete="tel" maxLength={30} placeholder="(85) 91234-5678" value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <div className="form-field"><label htmlFor="profile-email">E-mail</label><input id="profile-email" type="email" autoComplete="email" aria-describedby="profile-email-help" value={profile.email} readOnly /><small id="profile-email-help">Utilizado para comunicações institucionais e login de acesso. A alteração de e-mail ainda não está disponível.</small></div>
          </div>
          <div className="participant-profile__footer"><button className="secondary-button" type="button" onClick={cancelEditing}>Cancelar</button><button className="primary-button" type="submit">{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>
        </fieldset></form> : <>
          <dl className="participant-profile__readout">
            <div className="participant-profile__full"><dt>Nome completo</dt><dd>{profile.name}</dd></div>
            <div><dt>CPF</dt><dd>{displayCpf(profile.cpf)}</dd></div>
            <div><dt>Telefone</dt><dd>{displayPhone(profile.phone)}</dd></div>
            <div className="participant-profile__full"><dt>E-mail</dt><dd>{profile.email}</dd><p>Utilizado para comunicações institucionais e login de acesso.</p></div>
          </dl>
          {success && <p className="success participant-profile__saved" role="status">{success}</p>}
          <div className="participant-profile__footer participant-profile__footer--readout"><button className="primary-button" type="button" onClick={editProfile}>Editar Perfil</button></div>
        </>}
      </section>
      <section className="participant-profile__security" aria-label="Segurança da conta">
        {passwordOpen ? <PasswordSection onCancel={() => setPasswordOpen(false)} /> : <div className="participant-profile__security-summary">
          <div><h2 className="section-heading"><img src="/figma/06f06.svg" alt="" />Troca de Senha</h2><p>Para sua segurança, informe sua senha atual antes de cadastrar uma nova.</p></div>
          <button className="secondary-button" type="button" aria-expanded={false} onClick={() => setPasswordOpen(true)}>Alterar Senha</button>
        </div>}
      </section>
    </div>}
  </main></AppLayout>;
}

