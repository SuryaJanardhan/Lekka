import { useEffect, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { aiCatalog } from './aiCatalog';
import { ApiClient } from './api';

export function AiReference({ api, onChoose }: { api: ApiClient; onChoose: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try { setStatus(await api.aiStatus()); }
    catch (failure: any) { setError(failure.message || 'AI status unavailable'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open && !status && !loading && !error) void load(); }, [open]);
  return <section className="ai-reference">
    <button className="collapse-head" type="button" aria-expanded={open} onClick={() => setOpen(previous => !previous)}><span>AI skills & Spending Watch</span><ChevronRight size={18} className={open ? 'open' : ''} /></button>
    {open && <div className="ai-reference-body">
      <div className="section-title"><h3>Free-tier budget</h3><button className="icon-button" type="button" title="Refresh AI status" aria-label="Refresh AI status" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button></div>
      {error && <p role="alert">{error}</p>}
      {status && <dl className="ai-budget">
        <div><dt>Read-only connection</dt><dd>{status.readReady ? 'Verified' : 'Setup needed'}</dd></div>
        <div><dt>Requests reserved today</dt><dd>{status.dailyCalls} / {status.limits.dailyCalls}</dd></div>
        <div><dt>Model calls per minute</dt><dd>At most {status.limits.minuteCalls}</dd></div>
        <div><dt>Chat input / answer cap</dt><dd>{status.limits.input} / {status.limits.output} tokens</dd></div>
        <div><dt>Distinct configured keys</dt><dd>{status.keyCount}</dd></div>
      </dl>}
      {status?.setupError && <p className="ai-setup-error">{status.setupError}</p>}
      <dl className="ai-skill-reference">{aiCatalog.map(skill => <div key={skill.id}>
        <dt><button type="button" onClick={() => onChoose('@' + skill.id + ' ')}>@{skill.id}<ChevronRight size={15} /></button><small>{skill.kind}</small></dt>
        <dd>{skill.description}<span>{skill.cost}</span><code>{skill.example}</code></dd>
      </div>)}</dl>
      <p className="ai-watch-schedule">Automatic watch: after nightly ingestion, at most three findings and one grouped alert per day. Uses confirmed data only.</p>
      {status?.lastWatch && <p className="ai-watch-schedule">Last watch: {new Date(status.lastWatch.checkedAt).toLocaleString()} / {status.lastWatch.state.toLowerCase()}</p>}
    </div>}
  </section>;
}
