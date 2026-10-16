import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Category } from './types';

export function CategoryCreateForm({ onCreate, onCreated, onCancel }: {
  onCreate: (name: string) => Promise<Category>;
  onCreated: (category: Category) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError('');
    try { onCreated(await onCreate(name.trim())); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not create category'); }
    finally { setSaving(false); }
  };
  return <div className="category-create">
    <label>New category name<input aria-label="New category name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); create(); } }} maxLength={80} autoFocus disabled={saving} /></label>
    <div className="category-create-actions">
      <button className="secondary-button" type="button" disabled={saving || !name.trim()} onClick={create}><Plus size={17} />{saving ? 'Creating...' : 'Create category'}</button>
      <button className="icon-button" type="button" disabled={saving} title="Cancel new category" aria-label="Cancel new category" onClick={onCancel}><X size={17} /></button>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
