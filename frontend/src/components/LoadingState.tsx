/** Accessible loading text is announced once; placeholder shapes are decorative. */
export function LoadingState({ skeleton = false }: { skeleton?: boolean }) {
  return <div className="loading-state" aria-busy="true">
    <p role="status" className="loading-state__label">Carregando…</p>
    {skeleton && <div className="events-grid loading-skeleton" aria-hidden="true">
      {[0, 1, 2].map(index => <div className="event-card loading-skeleton__card" key={index}>
        <span className="loading-skeleton__line loading-skeleton__title" /><span className="loading-skeleton__line" />
        <span className="loading-skeleton__line" /><span className="loading-skeleton__line loading-skeleton__short" />
        <span className="loading-skeleton__line loading-skeleton__action" />
      </div>)}
    </div>}
  </div>;
}
