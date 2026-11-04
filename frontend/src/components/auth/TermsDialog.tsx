import { useEffect, useRef } from 'react';

export function TermsDialog({ title, close }: { title: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="terms-dialog" aria-labelledby="terms-title" onCancel={event => { event.preventDefault(); close(); }}>
    <h2 id="terms-title">{title}</h2>
    <p>O EventHub é um protótipo acadêmico da UECE. Esta versão permite criar contas, editar perfis e gerenciar organizações.</p>
    <p>Os dados informados são armazenados no ambiente do projeto para identificar a conta e operar essas funcionalidades. A senha é armazenada como hash; CPF, telefone e dados institucionais fazem parte do cadastro. O e-mail identifica sua conta e não é exibido publicamente.</p>
    <p>Responsáveis por organizações podem adicionar contas existentes à equipe. O nome e o e-mail dos membros ficam visíveis à própria equipe. Avisos promocionais ainda não são enviados; a preferência é apenas registrada.</p>
    <p>As informações cadastrais devem ser fornecidas por quem tem autorização para usá-las. Para solicitar correção ou exclusão, entre em contato com a equipe responsável pela demonstração acadêmica.</p>
    <p>Este texto descreve o funcionamento atual do protótipo. A política definitiva será revisada pela equipe antes de uma publicação de produção.</p>
    <button type="button" className="primary-button" onClick={close}>Entendi</button>
  </dialog>;
}

