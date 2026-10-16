import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Category } from './types';

export function CategoryPicker({ categories, value, onChange, onCreate }: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<Category>;
}) {
  const [creating, setCreating] = useState(false);
  const [previousValue, setPreviousValue] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const category = await onCreate(name.trim());
      onChange(category._id);
      setName('');
      setCreating(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create category');
    } finally { setSaving(false); }
  };

  return <div className="category-picker">
    <label>Category<select required value={creating ? '__new__' : value} disabled={saving} onChange={(event) => {
      if (event.target.value === '__new__') { setPreviousValue(value); onChange(''); setCreating(true); }
      else { setCreating(false); onChange(event.target.value); }
      setError('');
    }}>
      <option value="" disabled>Choose category</option>
      {categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}
      <option value="__new__">New category...</option>
    </select></label>
    {creating && <div className="category-create">
      <label>New category name<input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); create(); } }} maxLength={80} autoFocus disabled={saving} /></label>
      <div className="category-create-actions">
        <button className="secondary-button" type="button" disabled={saving || !name.trim()} onClick={create}><Plus size={17} />{saving ? 'Creating...' : 'Create category'}</button>
        <button className="icon-button" type="button" disabled={saving} title="Cancel new category" aria-label="Cancel new category" onClick={() => { setCreating(false); setName(''); setError(''); onChange(previousValue); }}><X size={17} /></button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
