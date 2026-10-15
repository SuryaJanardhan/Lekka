import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Category } from './types';

export function CategorySettings({ categories, onRename }: {
  categories: Category[];
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  return <details className="category-settings">
    <summary>Categories</summary>
    <div className="list">
      {categories.map((category) => <div className="settings-row" key={category._id}>
        {editing === category._id ? <form style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }} onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError('');
          try { await onRename(category._id, name.trim()); setEditing(''); }
          catch (failure) { setError(failure instanceof Error ? failure.message : 'Rename failed'); }
          finally { setSaving(false); }
        }}>
          <input aria-label="Category name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required autoFocus disabled={saving} style={{ flex: 1, minWidth: 0, width: 0 }} />
          <button className="icon-button" type="submit" title="Save category name" aria-label="Save category name" disabled={saving || !name.trim()}><Check size={18} /></button>
          <button className="icon-button" type="button" title="Cancel rename" aria-label="Cancel rename" disabled={saving} onClick={() => { setEditing(''); setError(''); }}><X size={18} /></button>
        </form> : <>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{category.name}</span>
          <button className="icon-button" type="button" title={`Rename ${category.name}`} aria-label={`Rename ${category.name}`} onClick={() => { setEditing(category._id); setName(category.name); setError(''); }}><Pencil size={16} /></button>
        </>}
      </div>)}
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
