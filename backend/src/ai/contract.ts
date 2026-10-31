export const skillIds = ['spending', 'compare', 'search', 'review', 'rules', 'watch'] as const;
export type SkillId = typeof skillIds[number];
export type Flow = 'DEBIT' | 'CREDIT' | 'BOTH';
export interface DateRange { start: string; end: string; label: string }
export interface SkillRequest {
  skill: SkillId; range: DateRange; previous?: DateRange; category?: string;
  direction: Flow; mode?: 'UPI' | 'CASH' | 'CARD' | 'FRIEND_PAID'; term?: string; page: number;
}
export const PAGE_SIZE = 3;
export function aiError(message: string, status = 400) { return Object.assign(new Error(message), { status }); }
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function validateRequest(value: SkillRequest): SkillRequest {
  if (!value || typeof value !== 'object' || !value.range || typeof value.range !== 'object') throw aiError('Invalid skill filters');
  if (Object.keys(value).some(key => !['skill', 'range', 'previous', 'category', 'direction', 'mode', 'term', 'page'].includes(key))) throw aiError('Only named skill filters are allowed');
  if (!skillIds.includes(value.skill) || !['DEBIT', 'CREDIT', 'BOTH'].includes(value.direction)) throw aiError('Unsupported read-only skill');
  for (const range of [value.range, value.previous].filter(Boolean) as DateRange[]) {
    const start = Date.parse(range.start), end = Date.parse(range.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 366 * 5 * 86400000) throw aiError('Choose a valid period of at most five years');
  }
  if (!Number.isInteger(value.page) || value.page < 1 || value.page > 100) throw aiError('Choose a page from 1 to 100');
  if (value.term && (typeof value.term !== 'string' || value.term.length > 80)) throw aiError('Use a search term of at most 80 characters');
  if (value.category && (typeof value.category !== 'string' || value.category.length > 80)) throw aiError('Invalid category');
  if (value.mode && !['UPI', 'CASH', 'CARD', 'FRIEND_PAID'].includes(value.mode)) throw aiError('Invalid payment mode');
  return value;
}
