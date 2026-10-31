import { aiError, DateRange } from './contract';

const DAY = 86400000, IST = 330 * 60000;
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function hasPeriod(text: string) {
  return /\b(?:this|last|current|previous)\s+(?:(?:7|seven)\s+days|month|week|year)|\btoday\b|\byesterday\b|\b20\d{2}-\d{2}-\d{2}\b/i.test(text) || new RegExp(`\\b(?:${months.map(name => `${name.slice(0, 3)}(?:${name.slice(3)})?`).join('|')})\\b`, 'i').test(text);
}
export function stripPeriods(text: string) {
  return text.replace(/\b(?:this|last|current|previous)\s+(?:(?:7|seven)\s+days|month|week|year)\b|\btoday\b|\byesterday\b|\b20\d{2}-\d{2}-\d{2}\b/gi, '')
    .replace(new RegExp(`\\b(?:${months.map(name => `${name.slice(0, 3)}(?:${name.slice(3)})?`).join('|')})(?:\\s+20\\d{2})?\\b`, 'gi'), '');
}
const iso = (year: number, month: number, day = 1) => new Date(Date.UTC(year, month, day) - IST).toISOString();
export function namedPeriod(name: string, now = new Date()): DateRange {
  const shifted = new Date(now.getTime() + IST), year = shifted.getUTCFullYear(), month = shifted.getUTCMonth(), day = shifted.getUTCDate();
  const today = Date.parse(iso(year, month, day));
  let start: string, end: string;
  switch (name) {
    case 'today': start = new Date(today).toISOString(); end = new Date(today + DAY).toISOString(); break;
    case 'yesterday': start = new Date(today - DAY).toISOString(); end = new Date(today).toISOString(); break;
    case 'this_week': { const monday = today - ((shifted.getUTCDay() + 6) % 7) * DAY; start = new Date(monday).toISOString(); end = new Date(today + DAY).toISOString(); break; }
    case 'last_week': { const monday = today - ((shifted.getUTCDay() + 6) % 7) * DAY; start = new Date(monday - 7 * DAY).toISOString(); end = new Date(monday).toISOString(); break; }
    case 'last_7_days': start = new Date(today - 6 * DAY).toISOString(); end = new Date(today + DAY).toISOString(); break;
    case 'previous_7_days': start = new Date(today - 13 * DAY).toISOString(); end = new Date(today - 6 * DAY).toISOString(); break;
    case 'this_month': start = iso(year, month); end = iso(year, month + 1); break;
    case 'last_month': start = iso(year, month - 1); end = iso(year, month); break;
    case 'this_year': start = iso(year, 0); end = iso(year + 1, 0); break;
    case 'last_year': start = iso(year - 1, 0); end = iso(year, 0); break;
    default: throw aiError('Unsupported period');
  }
  return { start, end, label: `${start.slice(0, 10)} to ${new Date(Date.parse(end) - 1).toISOString().slice(0, 10)} (IST boundaries)` };
}

export function parsePeriods(text: string, compare: boolean, now = new Date()): DateRange[] {
  const lowered = text.toLowerCase();
  const exact = [...lowered.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(match => match[1]);
  if (exact.length) {
    if (exact.length > 2) throw aiError('Use one date or a start and end date');
    const a = new Date(exact[0] + 'T00:00:00+05:30'), b = new Date((exact[1] || exact[0]) + 'T00:00:00+05:30');
    if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || new Date(a.getTime() + IST).toISOString().slice(0, 10) !== exact[0] || new Date(b.getTime() + IST).toISOString().slice(0, 10) !== (exact[1] || exact[0])) throw aiError('Invalid calendar date');
    if (compare) throw aiError('Compare named periods, for example last month and this month');
    return [{ start: a.toISOString(), end: new Date(b.getTime() + DAY).toISOString(), label: `${exact[0]} to ${exact[1] || exact[0]} (IST)` }];
  }
  const named: Array<{ index: number; range: DateRange }> = [];
  const definitions = [['previous\\s+7\\s+days', 'previous_7_days'], ['last\\s+7\\s+days', 'last_7_days'], ['(?:this|current)\\s+month', 'this_month'], ['last\\s+month', 'last_month'], ['(?:this|current)\\s+week', 'this_week'], ['last\\s+week', 'last_week'], ['(?:this|current)\\s+year', 'this_year'], ['last\\s+year', 'last_year'], ['yesterday', 'yesterday'], ['today', 'today']];
  for (const [pattern, key] of definitions) {
    const match = new RegExp(`\\b${pattern}\\b`, 'i').exec(lowered);
    if (match) named.push({ index: match.index, range: { ...namedPeriod(key, now), label: key.replace(/_/g, ' ') } });
  }
  const year = new Date(now.getTime() + IST).getUTCFullYear();
  const monthPattern = new RegExp(`\\b(${months.map(name => `${name.slice(0, 3)}(?:${name.slice(3)})?`).join('|')})(?:\\s+(20\\d{2}))?\\b`, 'g');
  for (const match of lowered.matchAll(monthPattern)) {
    const month = months.findIndex(name => name.startsWith(match[1])); const selectedYear = Number(match[2] || year);
    named.push({ index: match.index!, range: { start: iso(selectedYear, month), end: iso(selectedYear, month + 1), label: `${months[month]} ${selectedYear}` } });
  }
  const periods = named.sort((a, b) => a.index - b.index).map(item => item.range);
  if (periods.length > 2) throw aiError('Choose at most two periods');
  if (compare && periods.length === 1) throw aiError('Choose both comparison periods, for example September and October');
  if (!periods.length) return compare ? [{ ...namedPeriod('last_month', now), label: 'last month' }, { ...namedPeriod('this_month', now), label: 'this month' }] : [{ ...namedPeriod('this_month', now), label: 'this month' }];
  if (!compare && periods.length > 1) throw aiError('Use @compare for two periods');
  return periods;
}
