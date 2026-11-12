import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { Category } from './types';

const recentKey = 'lekka_recent_categories';
function readRecent() { try { const value = JSON.parse(localStorage.getItem(recentKey) || '[]'); return Array.isArray(value) ? value.filter(id => typeof id === 'string').slice(0, 5) : []; } catch { return []; } }

export function CategorySelect({ categories, value, onChange, label = 'Category', placeholder = 'Choose category', disabled, allowEmpty, onNew }: {
  categories: Category[]; value: string; onChange: (id: string) => void; label?: string; placeholder?: string; disabled?: boolean; allowEmpty?: boolean; onNew?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>(readRecent);
  const selected = categories.find(category => category._id === value);
  const recent = useMemo(() => recentIds.map(id => categories.find(category => category._id === id)).filter((category): category is Category => Boolean(category)), [recentIds, categories]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape); };
  }, [open]);
  const choose = (id: string) => {
    onChange(id); setOpen(false);
    if (!id) return;
    const next = [id, ...recentIds.filter(value => value !== id)].slice(0, 5);
    setRecentIds(next); try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch {}
  };
  return <>
    <button className="dropdown-trigger category-select-trigger" type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen(true)}>
      <span>{selected ? <><i style={{ background: selected.colorCode }} />{selected.name}</> : placeholder}</span><ChevronDown size={17} />
    </button>
    {open && createPortal(<div className="category-select-backdrop" onClick={() => setOpen(false)}>
      <section className="category-select-sheet" role="dialog" aria-modal="true" aria-label={`Choose ${label}`} onClick={event => event.stopPropagation()}>
        <header><div><span>Select</span><h2>{label}</h2></div><button className="icon-button" type="button" aria-label="Close category picker" onClick={() => setOpen(false)}><X size={18} /></button></header>
        {recent.length > 0 && <section><h3>Recent</h3><div className="category-recent" aria-label="Recent categories">{recent.map(category => <button key={category._id} type="button" className={category._id === value ? 'selected' : ''} onClick={() => choose(category._id)}><i style={{ background: category.colorCode }} />{category.name}</button>)}</div></section>}
        <section className="category-all-section"><h3>All categories</h3><div className="category-choice-grid" aria-label="All categories">
          {categories.map(category => <button key={category._id} type="button" className={category._id === value ? 'selected' : ''} onClick={() => choose(category._id)}><i style={{ background: category.colorCode }} /><span>{category.name}</span>{category._id === value && <Check size={16} />}</button>)}
        </div></section>
        <footer>
          {allowEmpty && value && <button className="secondary-button" type="button" onClick={() => choose('')}>Clear</button>}
          {onNew && <button className="secondary-button" type="button" onClick={() => { setOpen(false); onNew(); }}><Plus size={17} />New category</button>}
        </footer>
      </section>
    </div>, document.body)}
  </>;
}
