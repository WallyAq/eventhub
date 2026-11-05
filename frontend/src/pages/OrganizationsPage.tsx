import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { useAuth } from '../auth/AuthContext';
import { ApiError, errorMessage } from '../services/identity';
import { addMember, createOrganization, getOrganization, listMembers, listOrganizations, updateOrganization } from '../services/organizations';
import type { Organization, OrganizationMember } from '../types/organizations';
import './organizations.css';

export function OrganizationsPage() {
  const { session, signOut } = useAuth();
  const token = session?.token;
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) signOut('Sua sessão terminou. Entre novamente.');
    else setError(errorMessage(error));
  }, [signOut]);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    listOrganizations(token, controller.signal).then(items => { if (!controller.signal.aborted) setOrganizations(items); })
      .catch(error => { if (!controller.signal.aborted) handleError(error); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, handleError]);
  useEffect(() => {
    if (!token || !selectedId) return;
    const controller = new AbortController();
    setSelected(null); setMembers([]); setDetailsLoading(true); setError('');
    Promise.all([getOrganization(token, selectedId, controller.signal), listMembers(token, selectedId, controller.signal)])
      .then(([organization, members]) => {
        if (controller.signal.aborted) return;
        setSelected(organization); setName(organization.name); setDescription(organization.description); setMembers(members);
      }).catch(error => { if (!controller.signal.aborted) handleError(error); })
      .finally(() => { if (!controller.signal.aborted) setDetailsLoading(false); });
    return () => controller.abort();
  }, [token, selectedId, handleError]);
  if (!session) return <Navigate to="/organizacao/login" replace />;
  async function create(event: FormEvent) {
    event.preventDefault(); if (!token) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const organization = await createOrganization(token, newName, newDescription);
      setOrganizations(items => [...items, organization]); setNewName(''); setNewDescription('');
      setSelectedId(organization.id); setNotice('Organização criada. Você é o responsável.');
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }
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
  async function invite(event: FormEvent) {
    event.preventDefault(); if (!token || !selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await addMember(token, selected.id, email);
      setEmail(''); setMembers(await listMembers(token, selected.id)); setNotice('Organizador adicionado.');
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }
  return <AppLayout area="organization"><main className="organizations-main"><section className="status-panel auth-panel organization-panel" aria-labelledby="organizations-title">
    <header className="organizations-heading"><span className="eyebrow">ESPAÇO DO ORGANIZADOR</span><h2 id="organizations-title">Minhas organizações</h2>
    <p>Crie sua organização ou acesse aquelas das quais você faz parte.</p>
    </header>
    <div className="organizations-actions"><Link className="secondary-button" to="/organizacao/perfil">Perfil da organização</Link>
    <button type="button" className="secondary-button" disabled={busy} onClick={() => signOut()}>Sair da área da organização</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
    {loading ? <p role="status">Carregando organizações…</p> : organizations.length === 0 ? <p>Você ainda não faz parte de uma organização.</p> :
      <ul className="organization-list">{organizations.map(item => <li key={item.id}>
        <button type="button" className="organization-choice" aria-pressed={selectedId === item.id} disabled={busy} onClick={() => { setSelectedId(item.id); setNotice(''); }}>
          <span>{item.name}</span><small>{item.membershipRole === 'OWNER' ? 'Responsável' : 'Organizador'}</small>
        </button>
      </li>)}</ul>}
    {detailsLoading && <p role="status">Carregando detalhes…</p>}
    {selected && <section className="organization-section" aria-labelledby="organization-details">
      <h3 id="organization-details">{selected.name}</h3>
      <Link to={'/organizacao/perfil/' + selected.id}>Ver dados institucionais</Link>
      {selected.membershipRole === 'OWNER' ? <form onSubmit={save}><fieldset disabled={busy}>
        <label htmlFor="org-name">Nome da organização</label><input id="org-name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} />
        <label htmlFor="org-description">Descrição</label><textarea id="org-description" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} />
        <button type="submit">{busy ? 'Aguarde…' : 'Salvar organização'}</button>
      </fieldset></form> : <p>{selected.description || 'Sem descrição.'}</p>}
      <h3>Equipe</h3>
      <ul className="member-list">{members.map(member => <li key={member.id}><strong>{member.name}</strong><span>{member.email}</span><small>{member.role === 'OWNER' ? 'Responsável' : 'Organizador'}</small></li>)}</ul>
      {selected.membershipRole === 'OWNER' && <form onSubmit={invite}><fieldset disabled={busy}>
        <label htmlFor="member-email">Adicionar organizador pelo e-mail</label>
        <input id="member-email" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} aria-describedby="member-hint" />
        <small id="member-hint">A pessoa precisa ter uma conta cadastrada. A adição concede acesso imediato à organização.</small>
        <button type="submit">{busy ? 'Aguarde…' : 'Adicionar organizador'}</button>
      </fieldset></form>}
    </section>}
    <section className="organization-section" aria-labelledby="new-org-title"><h3 id="new-org-title">Criar organização</h3>
      <form onSubmit={create}><fieldset disabled={busy || loading || detailsLoading}>
        <label htmlFor="new-org-name">Nome</label><input id="new-org-name" required minLength={2} maxLength={120} value={newName} onChange={e => setNewName(e.target.value)} />
        <label htmlFor="new-org-description">Descrição (opcional)</label><textarea id="new-org-description" maxLength={2000} value={newDescription} onChange={e => setNewDescription(e.target.value)} />
        <button type="submit">{busy ? 'Aguarde…' : 'Criar organização'}</button>
      </fieldset></form>
    </section>
  </section></main></AppLayout>;
}

