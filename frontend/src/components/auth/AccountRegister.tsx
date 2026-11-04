import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../AuthLayout';
import { PasswordInput } from '../form/PasswordInput';
import { ProfileSelector } from './ProfileSelector';
import { TermsDialog } from './TermsDialog';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage, registerParticipant } from '../../services/identity';
import { accessAreas } from '../../auth/access';
import type { AccessArea } from '../../auth/access';

export function AccountRegister({ area }: { area: AccessArea }) {
  const institution = area === 'organization', access = accessAreas[area];
  const { session } = useAuth(), navigate = useNavigate();
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [cpf, setCpf] = useState(''), [phone, setPhone] = useState('');
  const [cnpj, setCnpj] = useState(''), [tradeName, setTradeName] = useState(''), [entityType, setEntityType] = useState('Universidade');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [terms, setTerms] = useState(false), [representation, setRepresentation] = useState(false), [marketing, setMarketing] = useState(false);
  const [policy, setPolicy] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (session) return <Navigate to={access.destination} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password !== confirmation) { setError('As senhas devem ser iguais.'); return; }
    setBusy(true);
    try {
      await registerParticipant(name, email, password, {
        ...(institution ? { phone, organization: { cnpj, legalName: name, tradeName, entityType, phone } } : { cpf, phone, marketingOptIn: marketing }),
        termsAccepted: terms,
      });
      setPassword(''); setConfirmation('');
      navigate(access.login, { replace: true, state: { registered: true } });
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <AuthLayout area={area} variant="register"><section className="figma-card registration-card" aria-labelledby="register-title" data-figma-node={institution ? '32:2988' : '2:126'}>
    <h1 id="register-title">Cadastre sua conta</h1><ProfileSelector area={area} />
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
      {institution && <div className="form-field"><label htmlFor="register-cnpj">CNPJ da Instituição<span className="required-mark">*</span></label><input id="register-cnpj" required maxLength={18} placeholder="12.345.678/0001-90" value={cnpj} onChange={e => setCnpj(e.target.value)} /></div>}
      <div className="form-field"><label htmlFor="register-name">{institution ? <>Razão Social<span className="required-mark">*</span></> : 'Nome completo'}</label><input id="register-name" name="name" autoComplete={institution ? 'organization' : 'name'} required minLength={2} maxLength={120} placeholder={institution ? 'Fundação de Apoio à Gestão Científica e Pesquisa' : 'Ex: Mariana Costa Santos'} value={name} onChange={e => setName(e.target.value)} /></div>
      {institution && <><div className="form-field"><label htmlFor="register-trade-name">Nome Fantasia ou Sigla<span className="required-mark">*</span></label><input id="register-trade-name" required minLength={2} maxLength={120} placeholder="FACEDI/Pró-reitoria de Eventos" value={tradeName} onChange={e => setTradeName(e.target.value)} /></div>
        <div className="form-grid"><div className="form-field"><label htmlFor="register-entity">Natureza/Tipo de Entidade<span className="required-mark">*</span></label><select id="register-entity" required value={entityType} onChange={e => setEntityType(e.target.value)}>{['Universidade','Instituto','Associação','Empresa','Outro'].map(type => <option key={type}>{type}</option>)}</select></div>
        <div className="form-field"><label htmlFor="register-phone">Telefone Institucional<span className="required-mark">*</span></label><input id="register-phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="(11) 22334-5566" value={phone} onChange={e => setPhone(e.target.value)} /></div></div></>}
      <div className="form-field"><label htmlFor="register-email">E-mail{institution && <span className="required-mark">*</span>}</label><input id="register-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder={institution ? 'eventos@facedi.uece.br' : 'seu.email@universidade.com.br'} value={email} onChange={e => setEmail(e.target.value)} /></div>
      {!institution && <div className="form-grid"><div className="form-field"><label htmlFor="register-cpf">CPF</label><input id="register-cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={cpf} onChange={e => setCpf(e.target.value)} /></div><div className="form-field"><label htmlFor="register-phone">Telefone</label><input id="register-phone" type="tel" autoComplete="tel" maxLength={30} placeholder="(12) 34567-8910" value={phone} onChange={e => setPhone(e.target.value)} /></div></div>}
      <div className="form-grid"><div className="form-field"><label htmlFor="register-password">Senha{institution && <span className="required-mark">*</span>}</label><PasswordInput id="register-password" name="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="••••••••••••" title="Use entre 8 e 128 caracteres" value={password} onChange={e => setPassword(e.target.value)} /></div><div className="form-field"><label htmlFor="register-confirmation">Confirmar senha{institution && <span className="required-mark">*</span>}</label><PasswordInput id="register-confirmation" name="confirmation" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="••••••••••••" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></div></div>
      <div className="consent-fields">
        {institution && <label className="checkbox-row"><input type="checkbox" required checked={representation} onChange={e => setRepresentation(e.target.checked)} /><span>Declaro possuir representação institucional/jurídica legal para responder e gerenciar eventos em nome desta instituição (CNPJ).</span></label>}
        <div className="checkbox-row"><input id="register-terms" type="checkbox" required checked={terms} onChange={e => setTerms(e.target.checked)} /><span><label htmlFor="register-terms">Li e concordo com os </label><button type="button" className="text-button" onClick={() => setPolicy('Termos de Uso')}>Termos de Uso</button> e a <button type="button" className="text-button" onClick={() => setPolicy('Política de Privacidade')}>Política de Privacidade (LGPD)</button>.</span></div>
        {!institution && <label className="checkbox-row"><input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} /><span>Desejo receber avisos sobre novos eventos e chamadas de trabalhos <span className="muted">(opcional)</span>.</span></label>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary-button" type="submit">{busy ? 'Criando conta…' : institution ? 'Cadastrar Instituição Organizadora' : 'Criar conta'}</button>
    </fieldset></form>
    <div className="auth-card-footer">Já tem uma conta? <Link to={access.login}>Entrar</Link></div>
  </section>{policy && <TermsDialog title={policy} close={() => setPolicy('')} />}</AuthLayout>;
}

