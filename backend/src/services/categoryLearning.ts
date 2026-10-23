import { IRuleCondition } from '../models/Rule';

export function learningConditions(sender: string, subject: string, merchant?: string, body = '', direction = 'DEBIT'): IRuleCondition[] {
  const conditions: IRuleCondition[] = [{ field: 'sender', operator: 'equals', value: sender.trim().toLowerCase() }];
  const name = merchant?.trim();
  if (name && name.length >= 3 && !name.includes('@') && !/^(?:unknown|merchant|general|n\/a)$/i.test(name)
    && body.toLowerCase().includes(name.toLowerCase())) {
    conditions.push({ field: 'body', operator: 'contains', value: name });
  } else {
    conditions.push({ field: 'subject', operator: 'equals', value: subject.trim() });
  }
  return [...conditions, { field: 'direction', operator: 'equals', value: direction }];
}
