import type { PriceOption } from '../../services/business';
import { RequiredMark } from '../form/RequiredMark';

const local = (value: string) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
};
export function PriceOptionsEditor({ rates, eventStart, onChange }: { rates: PriceOption[]; eventStart: string; onChange: (rates: PriceOption[]) => void }) {
  function field(id: string, change: Partial<PriceOption>) { onChange(rates.map(rate => rate.id === id ? { ...rate, ...change } : rate)); }
  return <section className="price-options"><h3>4. Lotes e categorias de preço</h3><p>Opcional. Cada combinação tem um preço e período de venda. As vagas continuam compartilhadas pela atividade. A categoria é declarada pelo participante.</p>
    {rates.map((rate, index) => <fieldset key={rate.id} className="price-option"><legend>Preço {index + 1}</legend><div className="organizer-dialog__grid">
      <div className="form-field"><label htmlFor={'lot-' + rate.id}>Nome do lote<RequiredMark /></label><input id={'lot-' + rate.id} required minLength={2} maxLength={80} value={rate.lotName} onChange={e => field(rate.id, { lotName: e.target.value })} /></div>
      <div className="form-field"><label htmlFor={'category-' + rate.id}>Categoria<RequiredMark /></label><input id={'category-' + rate.id} required minLength={2} maxLength={80} placeholder="Graduação, pós-graduação, público geral…" value={rate.category} onChange={e => field(rate.id, { category: e.target.value })} /></div>
      <div className="form-field"><label htmlFor={'price-' + rate.id}>Preço em reais<RequiredMark /></label><input id={'price-' + rate.id} type="number" min={0} max={100000} step="0.01" required value={rate.priceCents / 100} onChange={e => field(rate.id, { priceCents: Math.round(Number(e.target.value) * 100) })} /></div>
      {(['startsAt', 'endsAt'] as const).map(key => <div className="form-field" key={key}><label htmlFor={key + rate.id}>{key === 'startsAt' ? 'Início das vendas' : 'Fim das vendas'}<RequiredMark /></label><input id={key + rate.id} type="datetime-local" required max={eventStart || undefined} value={local(rate[key])} onChange={e => field(rate.id, { [key]: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></div>)}
    </div><button type="button" className="text-button" onClick={() => onChange(rates.filter(item => item.id !== rate.id))}>Remover preço {index + 1}</button></fieldset>)}
    <button type="button" className="secondary-button" disabled={rates.length >= 20} onClick={() => onChange([...rates, { id: crypto.randomUUID(), lotName: '', category: '', priceCents: 0, startsAt: new Date().toISOString(), endsAt: eventStart ? new Date(eventStart).toISOString() : '' }])}>Adicionar lote/categoria</button>
    {!!rates.length && <p>O participante precisa selecionar uma opção disponível. O preço será validado e fixado pelo servidor na inscrição, inclusive na fila de espera.</p>}
  </section>;
}
