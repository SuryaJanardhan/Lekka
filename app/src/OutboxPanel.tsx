import { RefreshCw, Trash2 } from 'lucide-react';
import type { LocalOperation } from './outboxTypes';

export function OutboxPanel({ operations, onResolve }: { operations: LocalOperation[]; onResolve: (id: string, action: 'retry' | 'discard') => Promise<void> }) {
  return <section className="stack outbox-panel">
    <h2>Pending changes <small>{operations.length}</small></h2>
    {operations.length === 0 && <p className="mini-status">All changes synced</p>}
    {operations.map(op => <article className="outbox-row" key={op.id}>
      <div><strong>{op.payload.title || op.payload.name || op.kind.replace('.', ' ')}</strong><span>{op.state === 'BLOCKED' ? 'Needs attention' : op.state === 'DONE' ? 'Saved; refreshing' : op.accepted ? 'Accepted by server' : 'Saved on this device'}</span>{op.error && <p role={op.state === 'BLOCKED' ? 'alert' : undefined}>{op.error}</p>}</div>
      {op.state === 'BLOCKED' && <div className="outbox-actions">
        <button className="icon-button" type="button" title="Retry change" aria-label={`Retry ${op.kind}`} onClick={() => void onResolve(op.id, 'retry')}><RefreshCw size={16} /></button>
        <button className="icon-button danger" type="button" title="Discard rejected change" aria-label={`Discard ${op.kind}`} onClick={() => { if (window.confirm('Discard this rejected change? It has not been applied to the database.')) void onResolve(op.id, 'discard'); }}><Trash2 size={16} /></button>
      </div>}
    </article>)}
  </section>;
}
