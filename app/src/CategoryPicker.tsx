import { useState } from 'react';
import { Category } from './types';
import { CategoryCreateForm } from './CategoryCreateForm';
import { CategorySelect } from './CategorySelect';

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
    <label>Category<CategorySelect categories={categories} label="Category" placeholder="Choose category" disabled={saving} value={value} onChange={(next) => { setCreating(false); onChange(next); }} onNew={() => { setPreviousValue(value); onChange(''); setCreating(true); }} /></label>
    {creating && <CategoryCreateForm onCreate={onCreate} onSavingChange={setSaving} onCreated={(category) => { onChange(category._id); setCreating(false); }} onCancel={() => { setCreating(false); onChange(previousValue); }} />}
  </div>;
}
