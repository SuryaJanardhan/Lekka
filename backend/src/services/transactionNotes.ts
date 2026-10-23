export function fiveWordNote(value: unknown): string {
  if (typeof value !== 'string') return '';
  const words = value.replace(/[*_`#]/g, '').trim().split(/\s+/).filter(Boolean);
  return words.length >= 5 ? words.slice(0, 5).join(' ') : '';
}

export function notesBackfillQuery() {
  return { 'parsedJson.isManual': { $ne: true }, 'parsedJson.notesSource': { $ne: 'USER' },
    $or: [{ 'parsedJson.notes': { $exists: false } }, { 'parsedJson.notes': null }, { 'parsedJson.notes': '' }] };
}
