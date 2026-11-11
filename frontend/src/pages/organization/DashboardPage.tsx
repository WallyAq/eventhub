import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BusinessLayout, Feedback } from '../../components/Business';
import { useAuth } from '../../auth/AuthContext';
import { api, date, money, statusLabel, useData } from '../../services/business';
import type { EventData } from '../../services/business';
import { errorMessage } from '../../services/identity';
import './dashboard.css';

type Counts = Record<string, number>;
type PaymentIndicators = { available: false; mode: 'SIMULATED'; reason?: string } | { available: true; mode: 'SIMULATED'; byStatus: Counts; approvedAmountCents: number; transactionCount: number; withoutTransactionCount: number };
export type EventReport = { eventId: string; eventTitle: string; eventStatus: string; total: number; byStatus: Counts; attendanceCount: number; confirmedAttendanceCount: number; simulatedRevenueCents: number; approvedPaymentCount?: number; payments?: PaymentIndicators; occupiedCount?: number; availableCount?: number; paymentMode: 'SIMULATED'; checkedAt: string; complete: boolean; registrationsByDay?: { day: string; count: number }[]; activities: { activityId: string; title: string; capacity: number; total: number; byStatus: Counts; occupiedCount?: number; availableCount?: number; attendanceCount: number; confirmedAttendanceCount: number; simulatedRevenueCents: number }[] };
const states = ['CONFIRMED', 'PENDING_PAYMENT', 'WAITLISTED', 'CANCELLED', 'EXPIRED'];
const number = (value: number) => value.toLocaleString('pt-BR');

function PaymentSummary({ report }: { report: EventReport }) {
  const payments = report.payments;
  const paymentStates = [['PENDING', 'Pendentes'], ['APPROVED', 'Aprovados'], ['DECLINED', 'Recusados'], ['EXPIRED', 'Expirados']];
  return <section className="business-card"><h2>Pagamentos e receita</h2><p className="dashboard-simulation">SIMULAÇÃO ACADÊMICA</p>{payments?.available === false ? <p role="status" className="dashboard-payment-warning">Os dados de pagamentos estão temporariamente indisponíveis. Atualize os indicadores para consultar os valores e os estados das transações.</p> : payments?.available ? <><div className="dashboard-money">{money(payments.approvedAmountCents)}</div><p>Valor aprovado em pagamentos simulados, sem liquidação financeira ou cobrança real.</p><dl className="dashboard-payment-status" aria-label="Estados das transações simuladas">{paymentStates.map(([state, label]) => <div key={state}><dt>{label}</dt><dd>{number(payments.byStatus[state] || 0)}</dd></div>)}</dl></> : <><div className="dashboard-money">{money(report.simulatedRevenueCents)}</div><p>Valores das inscrições confirmadas, sem liquidação financeira ou cobrança real.</p><p>{report.byStatus.PENDING_PAYMENT || 0} inscrições aguardam pagamento.</p></>}<Link to={'/organizacao/eventos/' + report.eventId + '/gestao?aba=inscricoes'}>Consultar participantes e inscrições →</Link></section>;
}

function Metrics({ reports, eventCount, ready }: { reports: EventReport[]; eventCount?: number; ready: boolean }) {
  const total = reports.reduce((sum, report) => sum + report.total, 0);
  const confirmed = reports.reduce((sum, report) => sum + report.byStatus.CONFIRMED, 0);
  const present = reports.reduce((sum, report) => sum + report.confirmedAttendanceCount, 0);
  const revenue = reports.reduce((sum, report) => sum + report.simulatedRevenueCents, 0);
  const metrics = [eventCount === undefined ? ['Inscrições recebidas', number(total), 'Inclui todos os estados da inscrição'] : ['Eventos no período', number(eventCount), 'Eventos sob sua responsabilidade'], ['Inscrições confirmadas', number(confirmed), `${number(total)} inscrições recebidas`], ['Presenças confirmadas', number(present), confirmed ? `${Math.round(present / confirmed * 100)}% das inscrições confirmadas` : 'Ainda sem inscrições confirmadas'], ['Receita simulada', money(revenue), 'Demonstração acadêmica · sem cobrança real']];
  return <div className="dashboard-metrics">{metrics.map(([label, value, note], index) => <article key={label} className="business-card dashboard-metric"><span className="dashboard-metric-icon" aria-hidden="true">{['▦', '♙', '✓', '↗'][index]}</span><h2>{label}</h2><strong>{index === 0 && eventCount !== undefined || ready ? value : '—'}</strong><p>{ready || index === 0 && eventCount !== undefined ? note : 'Aguardando os dados dos eventos'}</p></article>)}</div>;
}

function Trend({ reports }: { reports: EventReport[] }) {
  const days = new Map<string, number>();
  reports.forEach(report => report.registrationsByDay?.forEach(item => days.set(item.day, (days.get(item.day) || 0) + item.count)));
  let cumulative = 0;
  const points = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count, cumulative: cumulative += count }));
  const max = Math.max(1, cumulative);
  const coordinate = (index: number, value: number) => `${40 + index / Math.max(1, points.length - 1) * 720},${190 - value / max * 158}`;
  const line = points.map((point, index) => coordinate(index, point.cumulative)).join(' ');
  return <section className="business-card dashboard-trend"><div className="section-toolbar"><div><h2>Curva de inscrições acumuladas</h2><p>Inscrições recebidas por dia, no horário de Fortaleza.</p></div><span className="dashboard-chip">{number(cumulative)} inscrições</span></div>{!points.length ? <div className="dashboard-empty-chart">O gráfico aparecerá quando houver inscrições no período selecionado.</div> : <><svg viewBox="0 0 800 230" role="img" aria-label={`Curva acumulada de ${number(cumulative)} inscrições em ${points.length} dias`}><defs><linearGradient id="dashboard-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3d82b1" stopOpacity=".24" /><stop offset="1" stopColor="#3d82b1" stopOpacity=".02" /></linearGradient></defs>{[0, .25, .5, .75, 1].map(value => <g key={value}><line x1="40" x2="760" y1={190 - value * 158} y2={190 - value * 158} stroke="#e5ecf3" /><text x="30" y={194 - value * 158} textAnchor="end">{Math.round(value * max)}</text></g>)}<polygon points={`40,190 ${line} ${coordinate(points.length - 1, 0)}`} fill="url(#dashboard-fill)" /><polyline points={line} fill="none" stroke="#2e73a3" strokeWidth="2.5" strokeLinejoin="round" />{points.map((point, index) => <circle key={point.day} cx={40 + index / Math.max(1, points.length - 1) * 720} cy={190 - point.cumulative / max * 158} r="3.5" fill="#24658e"><title>{point.day.split('-').reverse().join('/')}: {point.count} novas inscrições; {point.cumulative} acumuladas</title></circle>)}<text x="40" y="218">{points[0].day.split('-').reverse().join('/')}</text><text x="760" y="218" textAnchor="end">{points.length > 1 ? points[points.length - 1].day.split('-').reverse().join('/') : ''}</text></svg><details className="dashboard-chart-table"><summary>Ver dados do gráfico</summary><table><thead><tr><th>Data</th><th>Novas inscrições</th><th>Acumuladas</th></tr></thead><tbody>{points.map(point => <tr key={point.day}><td>{point.day.split('-').reverse().join('/')}</td><td>{point.count}</td><td>{point.cumulative}</td></tr>)}</tbody></table></details></>}</section>;
}

function StatusChart({ reports }: { reports: EventReport[] }) {
  const counts = Object.fromEntries(states.map(state => [state, reports.reduce((sum, report) => sum + (report.byStatus[state] || 0), 0)]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const colors = ['#24658e', '#82adc9', '#b1c5d7', '#c5cbd4', '#e1e6ed'];
  let cursor = 0;
  const gradient = states.map((state, index) => { const start = cursor; cursor += total ? counts[state] / total * 100 : 0; return `${colors[index]} ${start}% ${cursor}%`; }).join(',');
  return <section className="business-card dashboard-status"><h2>Situação das inscrições</h2><p>Distribuição atual nos eventos selecionados.</p><div className="dashboard-status-content"><div className="dashboard-donut" style={{ background: total ? `conic-gradient(${gradient})` : '#e8eef4' }} role="img" aria-label={`${number(total)} inscrições no total`}><div><strong>{number(total)}</strong><small>inscrições</small></div></div><ul>{states.map((state, index) => <li key={state}><span style={{ background: colors[index] }} /><span>{statusLabel[state]}</span><strong>{number(counts[state])}</strong></li>)}</ul></div></section>;
}

function OverviewReports({ events, onRetry }: { events: EventData[]; onRetry: () => void }) {
  const { session } = useAuth();
  const token = session?.token;
  const [state, setState] = useState<{ reports: EventReport[]; failed: string[]; loaded: boolean }>({ reports: [], failed: [], loaded: false });
  const ids = events.map(event => event.id).sort().join(',');
  useEffect(() => {
    let active = true;
    setState({ reports: [], failed: [], loaded: false });
    const queue = ids ? ids.split(',') : [], reports: EventReport[] = [], failed: string[] = [];
    async function load() {
      while (active && queue.length) {
        const id = queue.shift()!;
        try { const result = await api<{ report: EventReport }>('/reports/events/' + id, token); if (!result.report.complete) throw Error('Relatório incompleto'); reports.push(result.report); }
        catch { failed.push(id); }
      }
    }
    void Promise.all([load(), load()]).then(() => { if (active) setState({ reports, failed, loaded: true }); });
    return () => { active = false; };
  }, [ids, token]);
  const ready = state.loaded && !state.failed.length;
  return <>{!state.loaded && <p role="status">Atualizando os indicadores dos eventos…</p>}{!!state.failed.length && <div role="alert" className="dashboard-warning"><p>Não foi possível consultar {state.failed.length} evento(s). Os totais estão indisponíveis para evitar um resultado incompleto.</p><button className="secondary-button" onClick={onRetry}>Tentar novamente</button></div>}<Metrics reports={state.reports} eventCount={events.length} ready={ready} />{ready && <><div className="dashboard-chart-grid"><Trend reports={state.reports} /><StatusChart reports={state.reports} /></div><section className="business-card"><div className="section-toolbar"><div><h2>Eventos monitorados</h2><p>Acesse os indicadores e a gestão de cada evento.</p></div><Link to="/organizacao/eventos">Ver todos os eventos →</Link></div><div className="dashboard-event-grid">{events.slice(0, 6).map(event => { const report = state.reports.find(report => report.eventId === event.id); return <article className="dashboard-event" key={event.id}><span className={'status-badge status-' + event.status}>{statusLabel[event.status]}</span><h3>{event.title}</h3><p>{event.organizationName}</p><p>{date(event.startsAt)}</p><div className="dashboard-event-numbers"><strong>{number(report?.total || 0)} <small>inscrições</small></strong><strong>{number(report?.byStatus.CONFIRMED || 0)} <small>confirmadas</small></strong></div><Link className="primary-button" to={'/organizacao/eventos/' + event.id + '/painel'}>Ver painel do evento</Link></article>; })}</div>{!events.length && <div className="empty-state"><h3>Nenhum evento neste período</h3><p>Altere os filtros ou cadastre seu primeiro evento.</p><Link className="primary-button" to="/organizacao/eventos/novo">Criar evento</Link></div>}</section></>}</>;
}

export function OrganizerDashboardPage() {
  const source = useData<{ events: EventData[] }>('/events?managed=true');
  const [year, setYear] = useState(''), [version, setVersion] = useState(0);
  const events = source.data?.events || [];
  const years = [...new Set(events.map(event => new Date(event.startsAt).getFullYear()))].sort((a, b) => b - a);
  const selected = events.filter(event => (!year || String(new Date(event.startsAt).getFullYear()) === year));
  return <BusinessLayout area="organization"><div className="organizer-dashboard"><header className="business-heading"><div><p className="dashboard-eyebrow">VISÃO GERAL DA ORGANIZAÇÃO</p><h1>Painel Geral do Organizador</h1><p>Acompanhe eventos, inscrições e resultados em um só lugar.</p></div><Link className="primary-button" to="/organizacao/eventos/novo">+ Criar novo evento</Link></header><div className="dashboard-toolbar"><span>{events[0]?.organizationName || 'Instituição vinculada à conta'}</span><label>Ano do evento<select value={year} onChange={event => setYear(event.target.value)}><option value="">Todos os anos</option>{years.map(value => <option key={value}>{value}</option>)}</select></label><button className="secondary-button" onClick={() => { source.reload(); setVersion(value => value + 1); }}>Atualizar indicadores</button></div><Feedback loading={source.loading} error={source.error} />{source.error && <button className="secondary-button" onClick={source.reload}>Tentar novamente</button>}{!source.loading && !source.error && source.data && <OverviewReports key={year + version} events={selected} onRetry={() => setVersion(value => value + 1)} />}</div></BusinessLayout>;
}

export function EventDashboardPage() {
  const { id } = useParams();
  const source = useData<{ report: EventReport }>('/reports/events/' + id);
  const { session } = useAuth();
  const [exporting, setExporting] = useState(false), [failure, setFailure] = useState('');
  const report = source.data?.report;
  async function download() {
    if (!session || exporting) return;
    setExporting(true); setFailure('');
    try { const response = await fetch('/api/reports/events/' + id + '/export.csv', { headers: { authorization: 'Bearer ' + session.token }, signal: AbortSignal.timeout(20000) }); if (!response.ok) throw Error('Não foi possível exportar o relatório.'); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = 'relatorio-' + id + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { setFailure(errorMessage(error)); } finally { setExporting(false); }
  }
  return <BusinessLayout area="organization"><div className="organizer-dashboard"><Link to="/organizacao/painel">← Painel geral do organizador</Link><Feedback loading={source.loading} error={source.error} />{source.error && <button className="secondary-button" onClick={source.reload}>Tentar novamente</button>}{!source.loading && !source.error && report && <><header className="business-heading"><div><p className="dashboard-eyebrow">PAINEL DO EVENTO</p><h1>{report.eventTitle}</h1><p>Atualizado em {date(report.checkedAt)} · {statusLabel[report.eventStatus]}</p></div><div className="organizer-actions"><Link className="secondary-button" to={'/organizacao/eventos/' + id + '/gestao'}>Gerenciar evento</Link><button className="primary-button" disabled={exporting || !report.complete} onClick={() => void download()}>{exporting ? 'Exportando…' : 'Exportar relatório CSV'}</button></div></header>{failure && <p className="error" role="alert">{failure}</p>}{!report.complete && <p role="alert" className="dashboard-warning">Relatório incompleto. Atualize os dados antes de consultar os indicadores.</p>}<Metrics reports={[report]} ready={report.complete} />{report.complete && <><div className="dashboard-chart-grid"><StatusChart reports={[report]} /><section className="business-card dashboard-capacity"><h2>Ocupação por atividade</h2><p>Confirmadas e reservas com prazo válido.</p>{report.activities.length ? report.activities.map(activity => { const occupied = activity.occupiedCount ?? (activity.byStatus.CONFIRMED || 0) + (activity.byStatus.PENDING_PAYMENT || 0); const available = activity.availableCount ?? Math.max(0, activity.capacity - occupied); return <div className="dashboard-capacity-row" key={activity.activityId}><div><strong>{activity.title}</strong><span>{occupied} / {activity.capacity} vagas</span></div><progress value={occupied} max={Math.max(1, activity.capacity)} aria-label={'Ocupação de ' + activity.title} /><small>{available} disponíveis · {activity.byStatus.WAITLISTED || 0} na lista de espera · {activity.attendanceCount} presenças</small></div>; }) : <div className="empty-state">Nenhuma atividade cadastrada.</div>}</section></div><div className="dashboard-chart-grid"><section className="business-card"><h2>Resultados por atividade</h2><div className="organizer-table-wrap"><table className="organizer-table"><thead><tr><th>Atividade</th><th>Inscrições</th><th>Confirmadas</th><th>Presenças</th></tr></thead><tbody>{report.activities.map(activity => <tr key={activity.activityId}><td>{activity.title}</td><td>{activity.total}</td><td>{activity.byStatus.CONFIRMED}</td><td>{activity.confirmedAttendanceCount}</td></tr>)}</tbody></table></div></section><PaymentSummary report={report} /></div><Trend reports={[report]} /></>}</>}</div></BusinessLayout>;
}
