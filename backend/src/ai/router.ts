import { aiError, escapeRegex, SkillId, skillIds, SkillRequest } from './contract';
import { parsePeriods, stripPeriods } from './periods';

export function chooseSkill(message: string): SkillId | undefined {
  const explicit = /(?:^|\s)@([a-z]+)\b/i.exec(message);
  if (explicit) {
    if (!skillIds.includes(explicit[1].toLowerCase() as SkillId)) throw aiError('Unknown skill. Choose @spending, @compare, @search, @review, @rules or @watch.');
    return explicit[1].toLowerCase() as SkillId;
  }
  if (/\b(compare|versus|vs\.?|difference|more than|less than)\b/i.test(message)) return 'compare';
  if (/\b(watch|unusual|duplicate|anomal|suspicious)/i.test(message)) return 'watch';
  if (/\b(review|uncategorized|uncategorised|pending categor)/i.test(message)) return 'review';
  if (/\b(rule|categorization|categorisation)/i.test(message)) return 'rules';
  if (/\b(find|search|look for|show.*transactions?|payments? (?:to|from|at))\b/i.test(message)) return 'search';
  if (/\b(spend|spending|spent|total|cash|upi|income|credit|debit|balance)/i.test(message)) return 'spending';
  return undefined;
}

export function buildRequest(skill: SkillId, message: string, categories: string[], now = new Date()): SkillRequest {
  const text = message.replace(/(?:^|\s)@[a-z]+\b/gi, ' ').replace(/^(?:and|what about|same|instead)\s+/i, '').trim();
  if (text.length > 240) throw aiError('Keep the skill question under 240 characters so its context stays small.');
  if (/\b(balance|bank balance)\b/i.test(text)) throw aiError('Lekka tracks transactions, not your bank balance. Ask for recorded debits, credits or net flow.');
  const directionText = text.replace(/credit\s+card/gi, 'card');
  const credit = /\b(credits?|income|received|refunds?)\b/i.test(directionText), debit = /\b(debits?|spend|spending|spent)\b/i.test(directionText);
  const category = categories.slice().sort((a, b) => b.length - a.length).find(name => new RegExp(`(?:^|\\W)${escapeRegex(name)}(?:$|\\W)`, 'i').test(text));
  if (/\bcategory\s*[:=]/i.test(text) && !category) throw aiError('Category not found. Use its exact name from Settings.');
  if (['spending', 'compare'].includes(skill) && !category) {
    const unrecognized = stripPeriods(text).replace(/\b(?:what|how|much|did|do|does|have|i|we|my|the|is|are|was|were|show|me|please|recorded|total|totals|amount|transactions?|payments?|spending|spend|spent|debits?|credits?|income|received|refunds?|cash|online|upi|card|friend|paid|in|on|for|to|from|at|and|or|vs|versus|compare|with|of|between|explain|why|insights?|more|less|than|page)\b/gi, '').replace(/[\d\s.,?!:;=+\-/]/g, '');
    if (unrecognized) throw aiError('I could not identify that category or filter. Use its exact name from Settings, or @search for a merchant.');
  }
  const periods = parsePeriods(text, skill === 'compare', now);
  const mode = /\bfriend[ -]paid\b/i.test(text) ? 'FRIEND_PAID' : /\bcash\b/i.test(text) ? 'CASH' : /\bupi\b/i.test(text) ? 'UPI' : /\bcard\b/i.test(text) ? 'CARD' : undefined;
  const quoted = /["\u201c]([^"\u201d]{1,80})["\u201d]/.exec(text)?.[1];
  let term: string | undefined;
  if (skill === 'search') {
    const explicit = /(?:^|\s)@search\b/i.test(message);
    term = quoted || stripPeriods(text.replace(/\bpage\s+\d+\b/gi, ''))
      .replace(/\b(?:debits?|credits?|income)\b/gi, '')
      .replace(/^(?:find|search(?: for)?|show(?: me)?|look for)\s+/i, '').replace(/^(?:transactions?|payments?|receipts?)\s*(?:(?:to|from|at|for)\s+)?/i, '').trim();
    if (!explicit && /^(?:the|my|all|recent|latest)?\s*$/i.test(term)) term = undefined;
    if (term && term.length > 80) throw aiError('Use a shorter merchant or search phrase.');
  }
  const page = Number(/\bpage\s+(\d+)\b/i.exec(text)?.[1] || 1);
  return { skill, range: periods[0], previous: periods[1], category, mode, term, page,
    direction: credit && debit ? 'BOTH' : credit ? 'CREDIT' : debit ? 'DEBIT' : ['search', 'review'].includes(skill) ? 'BOTH' : 'DEBIT' };
}
