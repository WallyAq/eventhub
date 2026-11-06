import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api, date, useData } from '../../services/business';
import type { EventData } from '../../services/business';
import { errorMessage } from '../../services/identity';
import { RequiredMark } from '../form/RequiredMark';

type Signatory = { name: string; role: string; image: string };
type Template = { title: string; speakerTitle: string; body: string; speakerBody: string; accentColor: string; background: string; signatories: Signatory[] };
type SpeakerCertificate = { id: string; participantName: string; activityTitle: string; issuedAt: string; valid: boolean };

async function upload(file: File, background: boolean): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5000000) throw new Error('Use uma imagem PNG ou JPEG de até 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, (background ? 1400 : 600) / image.width, (background ? 1000 : 200) / image.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Não foi possível preparar a imagem.');
    if (background) { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(background ? 'image/jpeg' : 'image/png', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export function CertificateSettings({ event }: { event: EventData }) {
  const { session } = useAuth();
  const path = '/organizer/events/' + event.id;
  const source = useData<{ settings: Template }>(path + '/certificate-settings');
  const certificates = useData<{ certificates: SpeakerCertificate[] }>(path + '/speaker-certificates');
  const [draft, setDraft] = useState<Template | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const alive = useRef(true), latestToken = useRef(session?.token); latestToken.current = session?.token;
  const reload = useRef(certificates.reload); reload.current = certificates.reload;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (source.data) setDraft(source.data.settings); }, [source.data]);
  useEffect(() => { if (!event.autoSpeakerCertificates) return; const timer = setInterval(() => reload.current(), 30000); return () => clearInterval(timer); }, [event.id, event.autoSpeakerCertificates]);
  const disabled = busy || event.status === 'CANCELLED';
  function field<K extends keyof Template>(key: K, value: Template[K]) { setDraft(current => current ? { ...current, [key]: value } : null); setMessage(''); }
  async function save() {
    if (!session || !draft || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { const data = await api<{ settings: Template }>(path + '/certificate-settings', session.token, 'PUT', draft); if (alive.current && latestToken.current === session?.token) { setDraft(data.settings); setMessage('Modelo salvo. A alteração será usada nas próximas emissões.'); } }
    catch (error) { if (alive.current && latestToken.current === session?.token) setError(errorMessage(error)); }
    finally { if (alive.current && latestToken.current === session?.token) setBusy(false); }
  }
  async function download(url: string, filename: string) {
    if (!session || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api' + url, { headers: { authorization: 'Bearer ' + session.token }, signal: AbortSignal.timeout(20000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/pdf')) throw new Error('Não foi possível baixar o PDF. Salve o modelo e tente novamente.');
      const blob = await response.blob(); if (await blob.slice(0, 5).text() !== "%PDF-") throw new Error("O arquivo recebido não é um PDF válido."); if (!alive.current || latestToken.current !== session?.token) return;
      const object = URL.createObjectURL(blob), link = document.createElement('a'); link.href = object; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(object), 1000);
    } catch (error) { if (alive.current && latestToken.current === session?.token) setError(errorMessage(error)); }
    finally { if (alive.current && latestToken.current === session?.token) setBusy(false); }
  }
  async function image(file: File | undefined, index?: number) {
    if (!file || !draft || busy) return;
    setBusy(true); setError('');
    try { const result = await upload(file, index === undefined); if (!alive.current || latestToken.current !== session?.token) return; if (index === undefined) field('background', result); else field('signatories', draft.signatories.map((person, i) => i === index ? { ...person, image: result } : person)); }
    catch (error) { if (alive.current && latestToken.current === session?.token) setError(errorMessage(error)); }
    finally { if (alive.current && latestToken.current === session?.token) setBusy(false); }
  }
  async function generate() {
    if (!session || busy) return;
    setBusy(true); setError('');
    try { const result = await api<{ issued: number }>(path + '/speaker-certificates', session.token, 'POST', {}); if (alive.current && latestToken.current === session?.token) { setMessage(result.issued ? `${result.issued} certificado(s) emitido(s).` : 'Nenhuma nova emissão: confira se as atividades já terminaram ou se os certificados já foram emitidos.'); certificates.reload(); } }
    catch (error) { if (alive.current && latestToken.current === session?.token) setError(errorMessage(error)); }
    finally { if (alive.current && latestToken.current === session?.token) setBusy(false); }
  }
  return <section className="business-card certificate-settings"><h2>Certificados e emissão digital</h2>
    <p>Personalize as próximas emissões. As imagens de assinatura são visuais; o documento possui código de autenticidade e não tem assinatura ICP-Brasil.</p>
    {source.loading && <p role="status">Carregando modelo…</p>}{source.error && <p className="error" role="alert">{source.error}</p>}
    {draft && <form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={disabled}><div className="organizer-setting-grid">
      {(['title', 'speakerTitle'] as const).map(key => <div className="form-field" key={key}><label htmlFor={'certificate-' + key}>{key === 'title' ? 'Título do certificado de participante' : 'Título do certificado de palestrante'}<RequiredMark /></label><input id={'certificate-' + key} required minLength={2} maxLength={80} value={draft[key]} onChange={e => field(key, e.target.value)} /></div>)}
      <div className="form-field"><label htmlFor="certificate-color">Cor de destaque<RequiredMark /></label><input id="certificate-color" required type="color" value={draft.accentColor} onChange={e => field('accentColor', e.target.value)} /></div>
    </div>{(['body', 'speakerBody'] as const).map(key => <div className="form-field" key={key}><label htmlFor={'certificate-' + key}>{key === 'body' ? 'Texto de participação' : 'Texto de atuação do palestrante'}<RequiredMark /></label><textarea id={'certificate-' + key} required minLength={10} maxLength={600} rows={4} value={draft[key]} onChange={e => field(key, e.target.value)} /></div>)}
      <p>Marcadores disponíveis: {'{{name}}, {{activity}}, {{event}}, {{hours}}, {{organization}}'}. Salve antes de baixar a prévia.</p>
      <div className="form-field"><label htmlFor="certificate-background">Imagem de fundo (PNG ou JPEG)</label><input id="certificate-background" type="file" accept="image/png,image/jpeg" onChange={e => { void image(e.target.files?.[0]); e.target.value = ''; }} /></div>
      {draft.background && <div className="certificate-image-preview"><img src={draft.background} alt="Fundo escolhido para o certificado" /><button type="button" className="text-button" onClick={() => field('background', '')}>Remover fundo</button></div>}
      <h3>Assinaturas e signatários</h3>{draft.signatories.map((person, index) => <fieldset className="certificate-signatory" key={index}><legend>Signatário {index + 1}</legend><div className="organizer-setting-grid">
        <div className="form-field"><label htmlFor={'signatory-name-' + index}>Nome do signatário<RequiredMark /></label><input id={'signatory-name-' + index} required minLength={2} maxLength={100} value={person.name} onChange={e => field('signatories', draft.signatories.map((p, i) => i === index ? { ...p, name: e.target.value } : p))} /></div>
        <div className="form-field"><label htmlFor={'signatory-role-' + index}>Cargo do signatário<RequiredMark /></label><input id={'signatory-role-' + index} required minLength={2} maxLength={100} value={person.role} onChange={e => field('signatories', draft.signatories.map((p, i) => i === index ? { ...p, role: e.target.value } : p))} /></div>
        <div className="form-field"><label htmlFor={'signature-image-' + index}>Imagem da assinatura</label><input id={'signature-image-' + index} type="file" accept="image/png,image/jpeg" onChange={e => { void image(e.target.files?.[0], index); e.target.value = ''; }} /></div>
      </div>{person.image && <div className="certificate-image-preview"><img src={person.image} alt={'Assinatura de ' + (person.name || 'signatário')} /><button type="button" className="text-button" onClick={() => field('signatories', draft.signatories.map((p, i) => i === index ? { ...p, image: '' } : p))}>Remover imagem</button></div>}<button type="button" className="text-button" onClick={() => field('signatories', draft.signatories.filter((_, i) => i !== index))}>Remover signatário {index + 1}</button></fieldset>)}
      <div className="organizer-actions"><button type="button" className="secondary-button" disabled={draft.signatories.length >= 2} onClick={() => field('signatories', [...draft.signatories, { name: '', role: '', image: '' }])}>Adicionar signatário</button><button className="primary-button">Salvar modelo</button></div>
    </fieldset></form>}
    <div className="organizer-actions"><button type="button" className="secondary-button" disabled={busy || !draft} onClick={() => { void download(path + '/certificate-preview', 'previa-participante.pdf'); }}>Prévia do participante (PDF)</button><button type="button" className="secondary-button" disabled={busy || !draft} onClick={() => { void download(path + '/certificate-preview?kind=SPEAKER', 'previa-palestrante.pdf'); }}>Prévia do palestrante (PDF)</button></div>
    <h3>Emissão automática para palestrantes</h3><p>{event.autoSpeakerCertificates ? 'Ativada: o servidor verifica as atividades encerradas a cada 30 segundos.' : 'Desativada. Ative no editor do rascunho antes de publicar.'} Cada atividade precisa de um palestrante vinculado.</p><button type="button" className="secondary-button" disabled={busy || !event.autoSpeakerCertificates || event.status !== 'PUBLISHED'} onClick={() => { void generate(); }}>Verificar emissões agora</button>
    {certificates.error && <p className="error" role="alert">{certificates.error}</p>}{certificates.data?.certificates?.map(item => <article className="organizer-list-row" key={item.id}><div><strong>{item.participantName}</strong><p>{item.activityTitle} · {date(item.issuedAt)}</p>{!item.valid && <p>Documento sem validade atual.</p>}</div><button type="button" className="secondary-button" disabled={busy || !item.valid} onClick={() => { void download('/speaker-certificates/' + item.id + '/download', 'certificado-palestrante-' + item.id + '.pdf'); }}>Baixar certificado</button></article>)}
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
  </section>;
}
