import { useId } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

type Option = { value: string; label: string; disabled?: boolean };

export function Dropdown({ value, onValueChange, options, label, placeholder = 'Choose option', disabled, required, allowEmpty }: {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
}) {
  const name = useId();
  return <Select.Root name={name} value={value} onValueChange={next => onValueChange(next === '__empty__' ? '' : next)} disabled={disabled} required={required}>
    <Select.Trigger className="dropdown-trigger" aria-label={label}>
      <Select.Value placeholder={placeholder} />
      <Select.Icon className="dropdown-chevron"><ChevronDown size={17} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="dropdown-menu" position="popper" sideOffset={6} collisionPadding={12}>
        <Select.ScrollUpButton className="dropdown-scroll"><ChevronUp size={16} /></Select.ScrollUpButton>
        <Select.Viewport className="dropdown-options">
          {allowEmpty && <Select.Item value="__empty__" className="dropdown-option"><Select.ItemText>{placeholder}</Select.ItemText></Select.Item>}
          {options.map(option => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="dropdown-option">
            <Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator className="dropdown-check"><Check size={16} /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
        <Select.ScrollDownButton className="dropdown-scroll"><ChevronDown size={16} /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
