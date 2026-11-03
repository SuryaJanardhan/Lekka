import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { ApiClient } from './api';

type Report = {
  periodKey: string; kind: 'weekly' | 'monthly'; period: { startDate: string; endDate: string; label: string };
  summary: { spend: number; credits: number; net: number; debitCount: number; creditCount: number; totalTransactions: number };
  topCategories: Array<{ name: string; spend: number; credits: number; count: number; changePercent?: number }>;
  paymentModes: Array<{ mode: string; spend: number; credits: number; count: number }>;
  largestTransactions: Array<{ title: string; amount: number; direction: string; category: string; date: string }>;
  comparison: { previousLabel: string; previousSpend: number; spendDelta: number; spendChangePercent?: number; previousCredits: number; creditsDelta: number };
  pendingReviews: number; generatedAt: string;
};

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const percent = (value?: number) => value === undefined || value === null ? 'new' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export function ReportsPanel({ api }: { api: ApiClient }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { const rows = await api.getReports(); setReports(rows); setSelected(previous => rows.find(row => row.periodKey === previous?.periodKey) || rows[0] || null); }
    catch (failure: any) { setError(failure.message || 'Reports unavailable'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const maxCategory = useMemo(() => Math.max(1, ...(selected?.topCategories || []).map(row => row.spend)), [selected]);
  if (loading) return <div className="empty-state">Loading reports...</div>;
  if (error) return <div className="empty-state" role="alert">{error}<button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Retry</button></div>;
  if (!selected) return <div className="empty-state"><strong>No reports yet</strong><span>Weekly reports appear on Sundays. Monthly reports appear on the last day of each month.</span></div>;
  return <section className="reports-view">
    <div className="reports-index" aria-label="Report history">
      <div className="section-title"><h2>Report history</h2><button className="icon-button" title="Refresh reports" aria-label="Refresh reports" onClick={() => void load()}><RefreshCw size={16} /></button></div>
      <div className="report-tabs">{reports.map(report => <button key={report.periodKey} className={report.periodKey === selected.periodKey ? 'selected' : ''} onClick={() => setSelected(report)}><strong>{report.kind === 'monthly' ? 'Monthly' : 'Weekly'}</strong><span>{report.period.label}</span><ChevronRight size={15} /></button>)}</div>
    </div>
    <article className="report-detail">
      <header><div><span>{selected.kind === 'monthly' ? 'Monthly report' : 'Weekly report'}</span><h2>{selected.period.label}</h2></div><small>Generated {new Date(selected.generatedAt).toLocaleDateString('en-IN')}</small></header>
      <div className="report-summary-grid">
        <ReportMetric label="Debits" value={money(selected.summary.spend)} />
        <ReportMetric label="Credits" value={money(selected.summary.credits)} />
        <ReportMetric label="Net flow" value={money(selected.summary.net)} />
        <ReportMetric label="Reviews" value={String(selected.pendingReviews)} />
      </div>
      <div className="report-comparison"><strong>Compared with {selected.comparison.previousLabel}</strong><span>Spending {selected.comparison.spendDelta >= 0 ? 'increased' : 'decreased'} by {money(Math.abs(selected.comparison.spendDelta))} ({percent(selected.comparison.spendChangePercent)}).</span></div>
      <section><h3>Top categories</h3><div className="report-category-list">{selected.topCategories.length ? selected.topCategories.map(row => <div className="report-category-row" key={row.name}><div><strong>{row.name}</strong><span>{money(row.spend)} · {percent(row.changePercent)}</span></div><i><b style={{ width: `${Math.max(2, row.spend / maxCategory * 100)}%` }} /></i></div>) : <p className="report-muted">No debit categories in this period.</p>}</div></section>
      <section><h3>Payment modes</h3><div className="report-mode-list">{selected.paymentModes.filter(row => row.spend || row.credits).map(row => <span key={row.mode}><strong>{row.mode.replace('_', ' ')}</strong><b>{money(row.spend)}</b></span>)}</div></section>
      <section><h3>Largest transactions</h3><div className="report-largest-list">{selected.largestTransactions.length ? selected.largestTransactions.map((row, index) => <div key={`${row.date}-${index}`}><span>{row.title}<small>{row.category} · {new Date(row.date).toLocaleDateString('en-IN')}</small></span><strong className={row.direction === 'CREDIT' ? 'amount-credit' : ''}>{row.direction === 'CREDIT' ? '+' : '-'}{money(row.amount)}</strong></div>) : <p className="report-muted">No transactions in this period.</p>}</div></section>
    </article>
  </section>;
}

function ReportMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
