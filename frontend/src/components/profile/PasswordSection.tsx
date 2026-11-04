import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { changePassword, errorMessage } from '../../services/identity';
import { PasswordInput } from '../form/PasswordInput';

export function PasswordSection({ onCancel }: { onCancel?: () => void } = {}) {
  const { session, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!session) return;
    if (next !== confirmation) { setError('As senhas devem ser iguais.'); return; }
    setBusy(true);
    try { await changePassword(session.token, current, next); setCurrent(''); setNext(''); setConfirmation(''); signOut('Senha atualizada. Entre novamente.'); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="password-section">
    <h2 className="section-heading"><img src="/figma/06f06.svg" alt="" />Troca de Senha</h2>
    <p>Para sua segurança, informe sua senha atual antes de cadastrar uma nova.</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <div className="form-field"><label htmlFor="password-current">Senha atual</label><PasswordInput id="password-current" autoComplete="current-password" required minLength={8} maxLength={128} placeholder="Digite sua senha atual" value={current} onChange={e => setCurrent(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="password-new">Nova senha</label><PasswordInput id="password-new" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="Crie uma nova senha segura" value={next} onChange={e => setNext(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="password-confirm">Confirmar nova senha</label><PasswordInput id="password-confirm" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="Repita a nova senha cadastrada" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">{onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancelar troca de senha</button>}<button className="primary-button" type="submit">{busy ? 'Atualizando…' : 'Atualizar Senha'}</button></div>
    </fieldset></form>
  </section>;
}

