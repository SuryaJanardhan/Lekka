import { RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, AtSign } from 'lucide-react';
import { aiCatalog, insertMention, skillMention } from './aiCatalog';

export function ChatComposer({ value, onChange, onSend, busy, inputRef }: {
  value: string; onChange: (value: string) => void; onSend: () => void; busy: boolean; inputRef: RefObject<HTMLTextAreaElement>;
}) {
  const [cursor, setCursor] = useState(value.length);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const listId = useId();
  const selection = useRef<{ text: string; cursor: number } | null>(null);
  const mention = skillMention(value, cursor);
  const options = mention ? aiCatalog.filter(skill => skill.id.startsWith(mention.query)) : [];
  const open = !busy && !dismissed && Boolean(mention) && options.length > 0;
  useEffect(() => { setHighlight(0); setDismissed(false); }, [mention?.query, mention?.from]);
  useEffect(() => { if (open) document.getElementById(`${listId}-${options[highlight]?.id}`)?.scrollIntoView({ block: 'nearest' }); }, [highlight, open]);
  useLayoutEffect(() => {
    const pending = selection.current;
    if (pending && pending.text === value) { inputRef.current?.focus(); inputRef.current?.setSelectionRange(pending.cursor, pending.cursor); }
    selection.current = null;
  }, [value]);
  const choose = (id: string) => {
    if (!mention) return;
    const inserted = insertMention(value, mention, id);
    selection.current = inserted;
    onChange(inserted.text); setCursor(inserted.cursor); setDismissed(true);
  };
  return <div className="chat-compose-zone">
    {open && <div className="skill-picker" role="listbox" id={listId} aria-label="AI skills and agents">
      {options.map((skill, index) => <button key={skill.id} id={`${listId}-${skill.id}`} type="button" role="option" aria-selected={index === highlight} className={index === highlight ? 'highlighted' : ''} onMouseDown={event => event.preventDefault()} onClick={() => choose(skill.id)}>
        {skill.kind === 'Agent' ? <Bot size={18} /> : <AtSign size={18} />}<span><strong>@{skill.id}<small>{skill.kind}</small></strong><span>{skill.name}</span></span>
      </button>)}
    </div>}
    <form className="assistant-input conversation-composer" onSubmit={event => { event.preventDefault(); onSend(); }}>
      <textarea ref={inputRef} rows={1} aria-label="Message AI" aria-autocomplete="list" aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${listId}-${options[highlight]?.id}` : undefined}
        value={value} placeholder="Ask about your ledger" onSelect={event => setCursor(event.currentTarget.selectionStart)}
        onChange={event => { onChange(event.target.value); setCursor(event.target.selectionStart); setDismissed(false); }}
        onKeyDown={event => {
          if (!open || event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setHighlight(previous => (previous + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); }
          if (event.key === 'Tab' && event.shiftKey) { setDismissed(true); return; }
          if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(options[highlight]?.id || options[0].id); }
        }} />
      <button type="submit" aria-label="Send message" title="Send message" disabled={busy || !value.trim() || value.trim().length > 240}><ArrowUp size={20} /></button>
    </form>
    {value.length > 200 && <span className={`composer-limit ${value.trim().length > 240 ? 'over-limit' : ''}`} aria-live="polite">{value.length}/240</span>}
  </div>;
}
