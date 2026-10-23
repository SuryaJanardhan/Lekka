import { IRuleCondition } from '../models/Rule';

export function validateConditions(value: unknown): IRuleCondition[] {
  if (!Array.isArray(value) || !value.length || value.length > 8) throw Object.assign(new Error('Use 1 to 8 rule conditions'), { status: 400 });
  return value.map(condition => {
    if (!condition || !['sender', 'subject', 'body', 'direction'].includes(condition.field) || !['contains', 'equals', 'startsWith', 'regex'].includes(condition.operator) || typeof condition.value !== 'string' || !condition.value.trim() || condition.value.length > 240) throw Object.assign(new Error('Invalid rule condition'), { status: 400 });
    if (condition.operator === 'regex') { try { new RegExp(condition.value, 'i'); } catch { throw Object.assign(new Error('Invalid rule regular expression'), { status: 400 }); } }
    if (condition.field === 'direction' && (condition.operator !== 'equals' || !['DEBIT', 'CREDIT'].includes(condition.value.toUpperCase()))) throw Object.assign(new Error('Direction rules must equal DEBIT or CREDIT'), { status: 400 });
    return { field: condition.field, operator: condition.operator, value: condition.field === 'direction' ? condition.value.toUpperCase() : condition.value.trim() };
  });
}

export function validatePriority(value: unknown): number {
  const priority = value === undefined ? 10 : Number(value);
  if (!Number.isInteger(priority) || priority < 0 || priority > 1000) throw Object.assign(new Error('Priority must be between 0 and 1000'), { status: 400 });
  return priority;
}
