export const aiCatalog = [
  { id: 'spending', name: 'Spending totals', kind: 'Skill', description: 'Confirmed debits or credits by date, category and payment mode.', example: '@spending Food last month', cost: 'No model call' },
  { id: 'compare', name: 'Period comparison', kind: 'Skill', description: 'Two periods, exact totals, difference and percentage change.', example: '@compare last month vs this month', cost: 'No model call' },
  { id: 'search', name: 'Transaction search', kind: 'Skill', description: 'Find a merchant, sender or receipt phrase. Three results per page.', example: '@search "HungerBox" this month', cost: 'No model call' },
  { id: 'review', name: 'Category reviews', kind: 'Skill', description: 'Pending category decisions in the selected period.', example: '@review this month', cost: 'No model call' },
  { id: 'rules', name: 'Saved rules', kind: 'Skill', description: 'Read category matching conditions and priorities. Never edits them.', example: '@rules Food', cost: 'No model call' },
  { id: 'watch', name: 'Spending Watch', kind: 'Agent', description: 'Possible duplicates, larger-than-usual debits and category increases. Flags are not proof; nothing is changed automatically.', example: '@watch', cost: 'No findings: no call. Otherwise at most one explanation call.' }
] as const;

export function skillMention(text: string, cursor: number) {
  const match = /(?:^|\s)@([a-z]*)$/i.exec(text.slice(0, cursor));
  return match ? { query: match[1].toLowerCase(), from: cursor - match[1].length - 1, to: cursor } : null;
}
export function insertMention(text: string, mention: { from: number; to: number }, id: string) {
  const prefix = text.slice(0, mention.from) + '@' + id + ' ';
  return { text: prefix + text.slice(mention.to).replace(/^ /, ''), cursor: prefix.length };
}
