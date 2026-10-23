export function fiveWordNote(value: unknown): string {
  if (Array.isArray(value) && value.every(word => typeof word === 'string')) value = value.join(' ');
  if (typeof value !== 'string') return '';
  const words = value.replace(/[*_`#]/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.some(word => /^word\d+$/i.test(word)) || words.join(' ').toLowerCase() === 'exactly five factual transaction words') return '';
  return words.length >= 5 ? words.slice(0, 5).join(' ') : '';
}

export function notesBackfillQuery() {
  return { 'parsedJson.notesSource': { $ne: 'USER' },
    $or: [{ 'parsedJson.notes': { $exists: false } }, { 'parsedJson.notes': null }, { 'parsedJson.notes': '' },
      { 'parsedJson.isManual': { $ne: true }, 'parsedJson.notesSource': { $exists: false }, $expr: { $and: [
        { $eq: ['$parsedJson.notes', '$rawTextBody'] }, { $gt: [{ $strLenCP: { $ifNull: ['$rawTextBody', ''] } }, 200] }
      ] } }
    ] };
}
