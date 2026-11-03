import { useId, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react';

type Option = { value: string; label: string; disabled?: boolean };

export function Dropdown({ value, onValueChange, options, label, placeholder = 'Choose option', disabled, required, allowEmpty, searchable = false }: {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
  searchable?: boolean;
}) {
  const name = useId();
  const [search, setSearch] = useState('');
  const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <Select.Root name={name} value={value} onValueChange={next => { onValueChange(next === '__empty__' ? '' : next); setSearch(''); }} onOpenChange={open => { if (!open) setSearch(''); }} disabled={disabled} required={required}>
    <Select.Trigger className="dropdown-trigger" aria-label={label}>
      <Select.Value placeholder={placeholder} />
      <Select.Icon className="dropdown-chevron"><ChevronDown size={17} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="dropdown-menu" position="popper" sideOffset={6} collisionPadding={12}>
        <Select.ScrollUpButton className="dropdown-scroll"><ChevronUp size={16} /></Select.ScrollUpButton>
        {searchable && <div className="dropdown-search"><Search size={15} /><input autoFocus aria-label={`Search ${label}`} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="Search categories" /></div>}
        <Select.Viewport className="dropdown-options">
          {allowEmpty && <Select.Item value="__empty__" className="dropdown-option"><Select.ItemText>{placeholder}</Select.ItemText></Select.Item>}
          {filtered.map(option => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="dropdown-option">
            <Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator className="dropdown-check"><Check size={16} /></Select.ItemIndicator>
          </Select.Item>)}
          {!filtered.length && <div className="dropdown-no-results">No matching categories</div>}
        </Select.Viewport>
        <Select.ScrollDownButton className="dropdown-scroll"><ChevronDown size={16} /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
