import { useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Category, Rule } from './types';
import { Dropdown } from './Dropdown';

type Condition = Rule['conditions'][number];
const initial: Condition = { field: 'subject', operator: 'contains', value: '' };

export function RulesPanel({ rules, categories, onSave, onDelete }: {
  rules: Rule[]; categories: Category[];
  onSave: (payload: Record<string, unknown>, id?: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([{ ...initial }]);
  const [categoryId, setCategoryId] = useState('');
  const [customName, setCustomName] = useState('');
  const [priority, setPriority] = useState('10');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const reset = () => { setEditing(''); setConditions([{ ...initial }]); setCategoryId(''); setCustomName(''); setPriority('10'); setError(''); };
  const patch = (index: number, value: Partial<Condition>) => setConditions(previous => previous.map((condition, i) => i === index ? { ...condition, ...value } : condition));

  return <section className="stack">
    <h2>Rules</h2>
    <form ref={form} className="form-card" onSubmit={async event => {
      event.preventDefault(); setSaving(true); setError('');
      try {
        await onSave({ conditions, priority: Number(priority), ...(customName.trim() && !editing ? { customCategoryName: customName.trim() } : { categoryId }) }, editing || undefined);
        reset();
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save rule'); }
      finally { setSaving(false); }
    }}>
      <h3>{editing ? 'Edit rule' : 'New rule'}</h3>
      {conditions.map((condition, index) => <div key={index} style={{ display: 'grid', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
        <div className="two-col">
          <label>Field {index + 1}<Dropdown label={`Rule field ${index + 1}`} disabled={saving} value={condition.field} onValueChange={value => patch(index, { field: value as Condition['field'], operator: value === 'direction' ? 'equals' : condition.operator, value: value === 'direction' ? 'DEBIT' : '' })} options={['sender', 'subject', 'body', 'direction'].map(value => ({ value, label: value }))} /></label>
          <label>Match {index + 1}<Dropdown label={`Rule match ${index + 1}`} disabled={saving || condition.field === 'direction'} value={condition.operator} onValueChange={value => patch(index, { operator: value as Condition['operator'] })} options={['contains', 'equals', 'startsWith', 'regex'].map(value => ({ value, label: value }))} /></label>
        </div>
        <div className="category-create-actions">
          <label style={{ flex: 1, minWidth: 0 }}>Value {index + 1}{condition.field === 'direction' ? <Dropdown label={`Rule value ${index + 1}`} disabled={saving} value={condition.value} onValueChange={value => patch(index, { value })} options={[{ value: 'DEBIT', label: 'Debit' }, { value: 'CREDIT', label: 'Credit' }]} /> : <input aria-label={`Rule value ${index + 1}`} required maxLength={240} disabled={saving} value={condition.value} onChange={event => patch(index, { value: event.target.value })} />}</label>
          <button className="icon-button danger" type="button" title="Remove condition" aria-label={`Remove condition ${index + 1}`} disabled={saving || conditions.length === 1} onClick={() => setConditions(previous => previous.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
        </div>
      </div>)}
      <button className="secondary-button" type="button" disabled={saving || conditions.length >= 8} onClick={() => setConditions(previous => [...previous, { ...initial }])}><Plus size={17} />Add condition</button>
      <div className="two-col">
        <label>Category<Dropdown label="Rule category" placeholder="Choose category" allowEmpty required={!customName.trim()} disabled={saving} value={categoryId} onValueChange={setCategoryId} options={categories.map(category => ({ value: category._id, label: category.name }))} /></label>
        <label>Priority<input type="number" min={0} max={1000} step={1} required disabled={saving} value={priority} onChange={event => setPriority(event.target.value)} /></label>
      </div>
      {!editing && <label>New category<input maxLength={80} disabled={saving} value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Optional" /></label>}
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Save rule'}</button>
      {editing && <button className="secondary-button" type="button" disabled={saving} onClick={reset}>Cancel edit</button>}
    </form>
    <div className="list">{rules.map(rule => <article className="rule-row" key={rule._id}>
      <div className="rule-content"><strong>{rule.categoryId?.name || 'Unassigned'}</strong><span>{rule.conditions.map(condition => `${condition.field} ${condition.operator} ${condition.value}`).join(' and ')}</span><small>Priority {rule.priority}</small></div>
      <div className="rule-actions">
        <button className="icon-button" type="button" title="Edit rule" aria-label={`Edit rule for ${rule.categoryId?.name || 'Unassigned'}`} onClick={() => {
          setEditing(rule._id); setCategoryId(rule.categoryId?._id || ''); setCustomName(''); setPriority(String(rule.priority)); setError('');
          const next = rule.conditions.map(condition => ({ ...condition }));
          if (rule.autoGenerated && !next.some(condition => condition.field === 'direction')) next.push({ field: 'direction', operator: 'equals', value: 'DEBIT' });
          setConditions(next); form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}><Pencil size={17} /></button>
        <button className="icon-button danger" type="button" title="Delete rule" aria-label={`Delete rule for ${rule.categoryId?.name || 'Unassigned'}`} onClick={() => onDelete(rule._id)}><Trash2 size={17} /></button>
      </div>
    </article>)}</div>
  </section>;
}
