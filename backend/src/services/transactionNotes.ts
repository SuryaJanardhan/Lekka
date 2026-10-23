export function fiveWordNote(value: unknown): string {
  if (typeof value !== 'string') return '';
  const words = value.replace(/[*_`#]/g, '').trim().split(/\s+/).filter(Boolean);
  return words.length >= 5 ? words.slice(0, 5).join(' ') : '';
}
