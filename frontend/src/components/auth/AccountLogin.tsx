import { RequiredMark } from '../form/RequiredMark';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../AuthLayout';
import { PasswordInput } from '../form/PasswordInput';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage, login } from '../../services/identity';
import { accessAreas } from '../../auth/access';
import type { AccessArea } from '../../auth/access';

export function AccountLogin({ area }: { area: AccessArea }) {
  const access = accessAreas[area], other = accessAreas[access.other];
  const auth = useAuth(), navigate = useNavigate(), location = useLocation();
  const key = 'eventhub.remember-email.' + area;
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const [remember, setRemember] = useState(() => { try { return !!localStorage.getItem(key); } catch { return false; } });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (auth.session) return <Navigate to={access.destination} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await login(email, password);
      try { if (remember) localStorage.setItem(key, email.trim()); else localStorage.removeItem(key); } catch { /* Armazenamento opcional. */ }
      auth.signIn(result); setPassword(''); navigate(access.destination, { replace: true });
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <AuthLayout area={area}><section className="figma-card login-card" aria-labelledby="login-title" data-figma-node="2:3">
    <div className="auth-heading"><h1 id="login-title">{area === 'participant' ? 'Acesse sua conta' : 'Acesse sua organização'}</h1>
      <p>{area === 'participant' ? 'Gerencie suas inscrições, certificados e atividades no EventHub.' : 'Gerencie sua organização e sua equipe no EventHub.'}</p></div>
    {location.state?.registered && <p className="success" role="status">Conta criada. Entre com seu e-mail e senha.</p>}
    {auth.notice && <p className="info" role="status">{auth.notice}</p>}
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
      <div className="form-field"><label htmlFor="login-email">E-mail<RequiredMark /></label><div className="email-control login-control">
        <span className="control-icon"><img src="/figma/88513.svg" alt="" /></span>
        <input id="login-email" name="email" type="email" autoComplete="email" placeholder="seu.email@instituicao.com.br" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      </div></div>
      <div className="form-field"><label htmlFor="login-password">Senha<RequiredMark /></label>
        <PasswordInput login id="login-password" name="password" autoComplete="current-password" placeholder="••••••••••••" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
        <Link className="text-button login-recovery-link" to={'/recuperar-senha?area='+area}>Esqueci minha senha</Link>
      </div>
      <label className="remember-row" title="Lembra seu e-mail para o próximo acesso. A sessão permanece conectada por até uma hora."><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Lembrar de mim</label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary-button login-submit" type="submit">{busy ? 'Entrando…' : 'Entrar'}</button>
    </fieldset></form>
    <div className="auth-card-footer">Não tem uma conta? <Link to={access.register}>Cadastre-se gratuitamente</Link></div>
  </section><div className="auth-other-area"><Link to={other.login}>Acesso de {other.label.toLowerCase()}</Link></div></AuthLayout>;
}

