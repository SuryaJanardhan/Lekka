import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { money } from './format';
import { BreakdownRow, shareOf, spendMapRows } from './spendMap';

export function SpendingSummary({ title, total, categories, modes }: {
  title: string; total: number; categories: BreakdownRow[]; modes: BreakdownRow[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const rows = spendMapRows(categories);
  const active = rows.filter(row => row.value > 0);
  const visible = spendMapRows(categories, search);
  const sum = active.reduce((sum, row) => sum + row.value, 0);
  const modeTotal = modes.reduce((sum, row) => sum + row.value, 0);
  let cursor = 0;

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return <section className="chart-card spend-summary">
    <div className="spend-heading"><h2>{title}</h2><span>This month</span></div>
    <div className="spend-ring">
      <svg viewBox="0 0 42 42" role="img" aria-label={`${title}: ${money(total)}`}>
        <circle cx="21" cy="21" r="16" fill="none" stroke="#e5e7eb" strokeWidth="4" />
        {active.map(row => {
          const size = shareOf(row.value, sum);
          const offset = -cursor;
          cursor += size;
          return <circle key={row.label} cx="21" cy="21" r="16" pathLength="100" fill="none" stroke={row.color || '#0f766e'} strokeWidth="4" strokeDasharray={`${size} ${100 - size}`} strokeDashoffset={offset} />;
        })}
      </svg>
      <div><strong style={{ fontSize: money(total).length > 12 ? 14 : 19 }}>{money(total)}</strong><span>{active.length} active {active.length === 1 ? 'category' : 'categories'}</span></div>
    </div>
    <div className="spend-category-bars">
      {active.slice(0, 5).map(row => <CategoryBar key={row.label} row={row} total={sum} />)}
      {!active.length && <p className="spend-empty">No transactions this month</p>}
    </div>
    <button className="spend-view-all" type="button" onClick={() => { setSearch(''); setOpen(true); }}>View all {categories.length} categories<ChevronRight size={17} /></button>
    <div className="spend-modes">
      {modes.filter(row => row.value > 0).map(row => <div className="spend-mode-row" key={row.label}>
        <div><span>{row.label.replace('_', ' ')}</span><strong>{money(row.value)}</strong></div>
        <div className="spend-track"><span style={{ width: `${shareOf(row.value, modeTotal)}%`, background: row.color || '#0f766e' }} /></div>
      </div>)}
      {!modeTotal && <p className="spend-empty">No payment mode data yet</p>}
    </div>
    <dialog ref={dialog} className="category-breakdown-dialog" aria-labelledby={heading} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="category-dialog-surface">
        <header><div><h2 id={heading}>{title} categories</h2><span>{money(total)} this month</span></div><button className="icon-button" type="button" aria-label="Close categories" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className="search-panel"><Search size={17} /><input autoFocus aria-label="Search categories" placeholder="Search categories" value={search} onChange={event => setSearch(event.target.value)} />{search && <button className="icon-button search-clear" type="button" aria-label="Clear category search" onClick={() => setSearch('')}><X size={16} /></button>}</div>
        <div className="category-breakdown-list">
          {visible.map((row, index) => <div key={row.label}>
            {row.value === 0 && (index === 0 || visible[index - 1].value > 0) && <h3 className="category-zero-heading">No transactions this month</h3>}
            <CategoryBar row={row} total={sum} />
          </div>)}
          {!visible.length && <p className="spend-empty">No matching categories</p>}
        </div>
      </div>
    </dialog>
  </section>;
}

function CategoryBar({ row, total }: { row: BreakdownRow; total: number }) {
  const percent = shareOf(row.value, total);
  return <div className="spend-category-row">
    <div><i style={{ background: row.color || '#0f766e' }} /><span>{row.label}</span><strong>{money(row.value)}</strong><small>{percent > 0 && percent < .1 ? '<0.1' : percent.toFixed(1)}%</small></div>
    <div className="spend-track"><span style={{ width: `${percent}%`, background: row.color || '#0f766e' }} /></div>
  </div>;
}
