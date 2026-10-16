import { useState } from 'react';
import { Category } from './types';
import { CategoryCreateForm } from './CategoryCreateForm';

export function CategoryPicker({ categories, value, onChange, onCreate }: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<Category>;
}) {
  const [creating, setCreating] = useState(false);
  const [previousValue, setPreviousValue] = useState('');

  return <div className="category-picker">
    <label>Category<select aria-label="Category" required value={creating ? '__new__' : value} onChange={(event) => {
      if (event.target.value === '__new__') { setPreviousValue(value); onChange(''); setCreating(true); }
      else { setCreating(false); onChange(event.target.value); }
    }}>
      <option value="" disabled>Choose category</option>
      {categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}
      <option value="__new__">New category...</option>
    </select></label>
    {creating && <CategoryCreateForm onCreate={onCreate} onCreated={(category) => { onChange(category._id); setCreating(false); }} onCancel={() => { setCreating(false); onChange(previousValue); }} />}
  </div>;
}
