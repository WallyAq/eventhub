import { useEffect, useRef, useState } from 'react';
import { OrganizerDialog } from './OrganizerDialog';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../services/business';
import type { EventData, Registration } from '../../services/business';
import { errorMessage } from '../../services/identity';

type Preview = { registration: Registration & { participant: { name: string; email: string } }; attendance: { checkedInAt: string } | null };
export function QrCheckInDialog({ event, activityId, onClose }: { event: EventData; activityId: string; onClose: () => void }) {
  const { session } = useAuth();
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const controls = useRef<{ stop: () => void } | null>(null), alive = useRef(true), epoch = useRef(0), resolving = useRef(false);
  const [camera, setCamera] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [text, setText] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [done, setDone] = useState(false);
  function stop() { epoch.current++; controls.current?.stop(); controls.current = null; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; }
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop(); }; }, []);
  function close() { if (!busy) { stop(); onClose(); } }
  async function resolve(credential: string) {
    if (!session || resolving.current) return;
    stop(); setCamera(false); setError(''); setPreview(null); setDone(false);
    if (!/^eventhub:check-in:v1:[a-f0-9-]{36}:[a-f0-9]{64}$/i.test(credential.trim())) { setError('Este QR Code não é uma credencial do EventHub.'); return; }
    resolving.current = true; setBusy(true);
    try {
      const result = await api<Preview>('/attendance/credentials/resolve', session.token, 'POST', { eventId: event.id, activityId, credential: credential.trim() });
      if (alive.current) setPreview(result);
    } catch (error) { if (alive.current) setError(errorMessage(error)); }
    finally { resolving.current = false; if (alive.current) setBusy(false); }
  }
  async function start() {
    stop(); const current = epoch.current; setError(''); setPreview(null); setDone(false); setCamera(true);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setCamera(false); setError('A câmera precisa de HTTPS ou localhost. Você também pode enviar uma imagem do QR Code.'); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!alive.current || epoch.current !== current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (!alive.current || epoch.current !== current || !video.current) { media.getTracks().forEach(track => track.stop()); return; }
      const running = await new BrowserQRCodeReader().decodeFromStream(media, video.current, result => {
        if (result && alive.current && epoch.current === current) void resolve(result.getText());
      });
      if (!alive.current || epoch.current !== current) running.stop(); else controls.current = running;
    } catch (error) {
      if (alive.current && epoch.current === current) { stop(); setCamera(false); setError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Permissão de câmera negada. Autorize no navegador ou envie uma imagem.' : 'Não foi possível abrir a câmera. Verifique se está conectada e disponível.'); }
    }
  }
  async function image(file?: File) {
    if (!file) return;
    stop(); const current = epoch.current; setCamera(false); setError(''); setPreview(null); setDone(false);
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5000000) { setError('Selecione PNG ou JPEG de até 5 MB.'); return; }
    const url = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      if (alive.current && epoch.current === current) await resolve(result.getText());
    } catch { if (alive.current && epoch.current === current) setError('Nenhum QR Code legível foi encontrado na imagem.'); }
    finally { URL.revokeObjectURL(url); }
  }
  async function confirm() {
    if (!session || !preview || busy || done || preview.attendance) return;
    setBusy(true); setError('');
    try { await api('/attendance/check-ins', session.token, 'POST', { registrationId: preview.registration.id }); if (alive.current) setDone(true); }
    catch (error) { if (alive.current) setError(errorMessage(error)); }
    finally { if (alive.current) setBusy(false); }
  }
  return <OrganizerDialog title="Ler QR Code e validar presença" description="Confira o participante antes de confirmar o check-in." onClose={close} onSubmit={() => { void confirm(); }} footer={<><button type="button" className="secondary-button" disabled={busy} onClick={close}>Fechar</button><button className="primary-button" disabled={busy || !preview || !!preview.attendance || done}>{busy ? 'Verificando…' : 'Confirmar presença'}</button></>}>
    <div className="qr-check-in"><video ref={video} autoPlay muted playsInline hidden={!camera} aria-label="Prévia da câmera para leitura de QR Code" />
      <div className="organizer-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => { if (camera) { stop(); setCamera(false); } else void start(); }}>{camera ? 'Desligar câmera' : 'Ativar câmera'}</button><label>Enviar imagem do QR<input aria-label="Imagem do QR Code" type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e => { void image(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
      <div className="form-field"><label htmlFor="qr-credential">Ou cole o conteúdo da credencial</label><textarea id="qr-credential" maxLength={200} value={text} onChange={e => setText(e.target.value)} /><button type="button" className="secondary-button" disabled={busy || !text.trim()} onClick={() => { void resolve(text); }}>Consultar credencial</button></div>
      {error && <p className="error" role="alert">{error}</p>}{preview && <section><h3>{preview.registration.participant.name}</h3><p>{preview.registration.participant.email}</p><p>{preview.registration.activity.title}</p>{preview.attendance && <p role="status">Presença já registrada.</p>}</section>}{done && <p className="success" role="status">Presença registrada com sucesso.</p>}
    </div>
  </OrganizerDialog>;
}
