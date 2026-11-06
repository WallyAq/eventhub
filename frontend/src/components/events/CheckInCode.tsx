import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function CheckInCode({ value }: { value?: string }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    let active = true; setSource('');
    if (value) QRCode.toDataURL(value, { width: 240, margin: 3, errorCorrectionLevel: 'M' })
      .then(url => { if (active) setSource(url); }).catch(() => { if (active) setSource(''); });
    return () => { active = false; };
  }, [value]);
  if (!value) return null;
  return <figure className="check-in-code">{source ? <img src={source} width={180} height={180} alt="QR Code da credencial para check-in" /> : <p role="status">Preparando QR Code…</p>}<figcaption>Apresente à organização para registrar sua presença.</figcaption></figure>;
}
