import { useState } from 'react';
import { Category } from './types';
import { CategoryCreateForm } from './CategoryCreateForm';
import { Dropdown } from './Dropdown';

export function CategoryPicker({ categories, value, onChange, onCreate }: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<Category>;
}) {
  const [creating, setCreating] = useState(false);
  const [previousValue, setPreviousValue] = useState('');
  const [saving, setSaving] = useState(false);

  return <div className="category-picker">
    <label>Category<Dropdown label="Category" placeholder="Choose category" required disabled={saving} value={creating ? '__new__' : value} onValueChange={(next) => {
      if (next === '__new__') { setPreviousValue(value); onChange(''); setCreating(true); }
      else { setCreating(false); onChange(next); }
    }} options={[...categories.map(category => ({ value: category._id, label: category.name })), { value: '__new__', label: 'New category...' }]} /></label>
    {creating && <CategoryCreateForm onCreate={onCreate} onSavingChange={setSaving} onCreated={(category) => { onChange(category._id); setCreating(false); }} onCancel={() => { setCreating(false); onChange(previousValue); }} />}
  </div>;
}
