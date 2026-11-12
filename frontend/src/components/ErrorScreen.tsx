import { Link } from 'react-router-dom';
import './error-screen.css';

/** Only display an HTTP status when the error actually supplies one. */
export function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = 'status' in error ? error.status : 'statusCode' in error ? error.statusCode : null;
  return typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : null;
}

export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = errorStatus(error);
  const notFound = status === 404;
  const forbidden = status === 403;
  const offline = error instanceof TypeError || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name));
  return <main className="error-screen" aria-labelledby="error-screen-title">
    <section className="error-screen__content">
      <img className="error-screen__illustration" src="/figma/error-illustration.svg" width="268" height="204" alt="" />
      <h1 id="error-screen-title">{notFound ? 'Ops! Página não encontrada.' : forbidden ? 'Ops! Acesso não permitido.' : 'Ops! Algo deu errado.'}</h1>
      <p className="error-screen__description">{notFound ? <>A página que você procura não foi encontrada.<br />Verifique o endereço ou volte para o início.</> : forbidden ? <>Você não tem permissão para acessar este conteúdo.<br />Volte para o início para continuar.</> : offline ? <>Não conseguimos conectar ao serviço no momento.<br />Verifique sua conexão e tente novamente.</> : <>Não conseguimos processar sua solicitação no momento.<br />Tente novamente em alguns instantes.</>}</p>
      <div className="error-screen__actions">
        <button type="button" className="primary-button" onClick={onRetry}>Tentar novamente</button>
        <Link className="secondary-button" to="/">Voltar para o início</Link>
      </div>
      <p className="error-screen__code" role="status">Código do erro: {status ?? 'não informado'}</p>
    </section>
  </main>;
}
