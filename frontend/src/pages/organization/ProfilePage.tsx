import { MaskedInput, formatInput } from '../../components/form/MaskedInput';
import { RequiredMark } from '../../components/form/RequiredMark';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { PasswordSection } from '../../components/profile/PasswordSection';
import { useAuth } from '../../auth/AuthContext';
import { ApiError, errorMessage } from '../../services/identity';
import { getOrganization, updateOrganization } from '../../services/organizations';
import type { Organization } from '../../types/organizations';
import './organization-profile.css';

export function OrganizationProfilePage() {
  const { session, signOut } = useAuth(), { id } = useParams();
  const token = session?.token;
  const institutionId = session?.user.organizationId;
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [legalName, setLegalName] = useState(''), [name, setName] = useState(''), [cnpj, setCnpj] = useState(''), [phone, setPhone] = useState(''), [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(false), [passwordOpen, setPasswordOpen] = useState(false);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setOrganization(null); setSuccess(''); setEditing(false); setPasswordOpen(false);
    (async () => {
      if (!institutionId || (id && id !== institutionId)) throw new Error('Instituição fora do vínculo autorizado da sua conta.');
      const current = await getOrganization(token, institutionId, controller.signal);
      if (controller.signal.aborted) return;
      if (current) { setOrganization(current); setLegalName(current.legalName || current.name); setName(current.name); setCnpj(current.cnpj || ''); setPhone(current.phone || ''); setEmail(current.email || ''); }
    })().catch(error => { if (controller.signal.aborted) return; if (error instanceof ApiError && error.status === 401) signOut('Sua sessão terminou. Entre novamente.'); else setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, institutionId, token, signOut]);
  if (!session) return <Navigate to="/organizacao/login" replace />;
  const owner = organization?.membershipRole === 'OWNER';
  function restoreFields(current: Organization) {
    setLegalName(current.legalName || current.name); setName(current.name); setCnpj(current.cnpj || ''); setPhone(current.phone || ''); setEmail(current.email || '');
  }
  function editProfile() {
    if (!organization || !owner) return;
    restoreFields(organization); setError(''); setSuccess(''); setEditing(true);
  }
  function cancelEditing() {
    if (!organization || busy) return;
    restoreFields(organization); setError(''); setSuccess(''); setEditing(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!token || !organization || !owner || busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const updated = await updateOrganization(token, organization.id, name, organization.description, { legalName, ...(cnpj ? { cnpj } : {}), phone, email });
      setOrganization(updated); restoreFields(updated); setEditing(false); setSuccess('Dados da instituição atualizados.');
    }
    catch (error) { if (error instanceof ApiError && error.status === 401) signOut('Sua sessão terminou. Entre novamente.'); else setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <AppLayout area="organization"><main className="profile-main organization-profile" data-figma-node={editing ? '2052:1962' : '2053:2098'}>
    <div className="page-heading"><h1>Meu Perfil</h1><p>Gerencie suas informações básicas de identificação e segurança de acesso institucional.</p></div>
    {loading && <p className="info" role="status">Carregando organização…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !organization && !error && <div className="profile-card"><p>Seu vínculo institucional não foi identificado.</p><Link to="/organizacoes">Consultar instituição e equipe</Link></div>}
    {organization && <div className="profile-card organization-profile__card">
      <section aria-labelledby="institution-account-heading">
        <div className="organization-profile__section-header"><h2 id="institution-account-heading" className="section-heading"><img src="/figma/98116.svg" alt="" />Dados da Conta</h2>
          {!owner && <p className="info">Somente o responsável pode editar os dados institucionais.</p>}
        </div>
        {editing && owner ? <form onSubmit={submit}><fieldset disabled={busy}>
          <div className="organization-profile__fields">
            <div className="form-field organization-profile__full"><label htmlFor="institution-legal-name">Nome/Razão Social<RequiredMark /></label><input id="institution-legal-name" required minLength={2} maxLength={120} value={legalName} onChange={e => setLegalName(e.target.value)} /></div>
            <div className="form-field"><label htmlFor="institution-cnpj">CNPJ<RequiredMark required={!!organization.cnpj} /></label><MaskedInput mask="cnpj" id="institution-cnpj" required={!!organization.cnpj} placeholder="12.345.678/0001-90" value={cnpj} onValueChange={setCnpj} /></div>
            <div className="form-field"><label htmlFor="institution-name">Nome Fantasia ou Sigla<RequiredMark /></label><input id="institution-name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="form-field"><label htmlFor="institution-phone">Telefone</label><MaskedInput mask="phone" autoComplete="tel" id="institution-phone" placeholder="(85) 91234-5678" value={phone} onValueChange={setPhone} /></div>
            <div className="form-field organization-profile__full"><label htmlFor="institution-email">E-mail</label><input id="institution-email" type="email" maxLength={254} aria-describedby="institution-email-help" value={email} onChange={e => setEmail(e.target.value)} /><small id="institution-email-help">Utilizado para comunicações institucionais. Sua conta pessoal de acesso é mantida.</small></div>
          </div>
          <div className="organization-profile__footer"><button type="button" className="secondary-button" onClick={cancelEditing}>Cancelar</button><button type="submit" className="primary-button">{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>
        </fieldset></form> : <>
          <dl className="organization-profile__fields organization-profile__readout">
            <div className="organization-profile__full"><dt>Nome/Razão Social</dt><dd>{organization.legalName || organization.name}</dd></div>
            <div><dt>CNPJ</dt><dd>{formatInput(organization.cnpj || '', 'cnpj') || 'Não informado'}</dd></div>
            <div><dt>Nome Fantasia ou Sigla</dt><dd>{organization.name}</dd></div>
            <div><dt>Telefone</dt><dd>{formatInput(organization.phone || '', 'phone') || 'Não informado'}</dd></div>
            <div className="organization-profile__full"><dt>E-mail</dt><dd>{organization.email || 'Não informado'}</dd><p>Utilizado para comunicações institucionais. Sua conta pessoal de acesso é mantida.</p></div>
          </dl>
          {success && <p className="success organization-profile__feedback" role="status">{success}</p>}
          {owner && <div className="organization-profile__footer organization-profile__footer--readout"><button type="button" className="primary-button" onClick={editProfile}>Editar Perfil</button></div>}
        </>}
      </section>
      <section className="organization-profile__security">
        {passwordOpen ? <PasswordSection onCancel={() => setPasswordOpen(false)} /> : <div className="organization-profile__security-summary">
          <div><h2 className="section-heading"><img src="/figma/06f06.svg" alt="" />Troca de Senha</h2><p>Para sua segurança, informe sua senha atual antes de cadastrar uma nova.</p></div>
          <button type="button" className="secondary-button" onClick={() => setPasswordOpen(true)}>Alterar Senha</button>
        </div>}
      </section>
    </div>}
  </main></AppLayout>;
}

