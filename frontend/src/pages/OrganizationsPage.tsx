import { RequiredMark } from '../components/form/RequiredMark';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { useAuth } from '../auth/AuthContext';
import { ApiError, errorMessage } from '../services/identity';
import { getOrganization, listMembers, updateOrganization } from '../services/organizations';
import type { Organization, OrganizationMember } from '../types/organizations';
import './organizations.css';

export function OrganizationsPage() {
  const { session, signOut } = useAuth();
  const token = session?.token;
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const selectedId = session?.user.organizationId;
  const [selected, setSelected] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) signOut('Sua sessão terminou. Entre novamente.');
    else setError(errorMessage(error));
  }, [signOut]);
  useEffect(() => {
    if (!token || !selectedId) return;
    const controller = new AbortController();
    setSelected(null); setMembers([]); setDetailsLoading(true); setError('');
    Promise.all([getOrganization(token, selectedId, controller.signal), listMembers(token, selectedId, controller.signal)])
      .then(([organization, members]) => {
        if (controller.signal.aborted) return;
        setSelected(organization); setOrganizations([organization]); setName(organization.name); setDescription(organization.description); setMembers(members);
      }).catch(error => { if (!controller.signal.aborted) handleError(error); })
      .finally(() => { if (!controller.signal.aborted) setDetailsLoading(false); });
    return () => controller.abort();
  }, [token, selectedId, handleError]);
  if (!session) return <Navigate to="/organizacao/login" replace />;
  async function save(event: FormEvent) {
    event.preventDefault(); if (!token || !selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const organization = await updateOrganization(token, selected.id, name, description);
      setSelected(organization); setOrganizations(items => items.map(item => item.id === organization.id ? organization : item));
      setNotice('Organização atualizada.');
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }
  return <AppLayout area="organization"><main className="organizations-main"><section className="status-panel auth-panel organization-panel" aria-labelledby="organizations-title">
    <header className="organizations-heading"><span className="eyebrow">ESPAÇO DO ORGANIZADOR</span><h2 id="organizations-title">Minha instituição e equipe</h2>
    <p>Organização e instituição representam a mesma entidade no EventHub. Sua conta está vinculada exclusivamente à instituição validada pelo servidor.</p>
    </header>
    <div className="organizations-actions"><Link className="secondary-button" to="/organizacao/perfil">Perfil da organização</Link>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
    {!detailsLoading && !error && organizations.length === 0 ? <p>Não foi possível identificar seu vínculo institucional. Entre novamente ou contate o responsável.</p> :
      <ul className="organization-list">{organizations.map(item => <li key={item.id}>
        <div className="organization-choice">
          <span>{item.name}</span><small>{item.membershipRole === 'OWNER' ? 'Responsável' : 'Organizador'}</small>
        </div>
      </li>)}</ul>}
    {detailsLoading && <p role="status">Carregando detalhes…</p>}
    {selected && <section className="organization-section" aria-labelledby="organization-details">
      <h3 id="organization-details">{selected.name}</h3>
      <Link to={'/organizacao/perfil/' + selected.id}>Ver dados institucionais</Link>
      {selected.membershipRole === 'OWNER' ? <form onSubmit={save}><fieldset disabled={busy}>
        <label htmlFor="org-name">Nome da organização<RequiredMark /></label><input id="org-name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} />
        <label htmlFor="org-description">Descrição</label><textarea id="org-description" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} />
        <button type="submit">{busy ? 'Aguarde…' : 'Salvar organização'}</button>
      </fieldset></form> : <p>{selected.description || 'Sem descrição.'}</p>}
      <h3>Equipe</h3>
      <ul className="member-list">{members.map(member => <li key={member.id}><strong>{member.name}</strong><span>{member.email}</span><small>{member.role === 'OWNER' ? 'Responsável' : 'Organizador'}</small></li>)}</ul>
    </section>}
  </section></main></AppLayout>;
}

