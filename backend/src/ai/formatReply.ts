import { PAGE_SIZE, SkillRequest } from './contract';

export const inr = (paise: number) => `INR ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function summaryLines(result: any, request: SkillRequest) {
  const labels = [`${result.period.label}${request.category ? ` / ${request.category}` : ''}${request.mode ? ` / ${request.mode}` : ''}`];
  if (request.direction !== 'CREDIT') labels.push(`Debits: ${inr(result.debitPaise)}`);
  if (request.direction !== 'DEBIT') labels.push(`Credits: ${inr(result.creditPaise)}`);
  labels.push(`${result.count} recorded transactions. Confirmed ledger only.`);
  return labels;
}
export function formatSkillReply(result: any, request: SkillRequest, previous?: any): string {
  if (result.kind === 'summary') {
    if (request.view === 'modes') {
      const field = request.direction === 'CREDIT' ? 'creditPaise' : 'debitPaise';
      const cash = result.modes.find((row: any) => row.mode === 'CASH')?.[field] || 0;
      const online = result.modes.filter((row: any) => ['UPI', 'CARD'].includes(row.mode)).reduce((sum: number, row: any) => sum + row[field], 0);
      const friend = result.modes.find((row: any) => row.mode === 'FRIEND_PAID')?.[field] || 0;
      return [`${result.period.label} / ${request.direction === 'CREDIT' ? 'credits' : 'debits'}`, `Cash: ${inr(cash)}`, `Online (UPI + card): ${inr(online)}`, `Friend paid: ${inr(friend)}`, 'Confirmed ledger only.'].join('\n');
    }
    if (!previous) return summaryLines(result, request).join('\n');
    if (request.direction === 'BOTH') return [formatSkillReply(result, { ...request, direction: 'DEBIT' }, previous), formatSkillReply(result, { ...request, direction: 'CREDIT' }, previous)].join('\n\n');
    const old = request.direction === 'CREDIT' ? previous.creditPaise : previous.debitPaise, current = request.direction === 'CREDIT' ? result.creditPaise : result.debitPaise;
    const delta = current - old;
    const previousCount = request.direction === 'CREDIT' ? previous.creditCount ?? previous.count : previous.debitCount ?? previous.count;
    const currentCount = request.direction === 'CREDIT' ? result.creditCount ?? result.count : result.debitCount ?? result.count;
    return [`${request.direction === 'CREDIT' ? 'Credits received' : 'Debit spending'}${request.category ? ` / ${request.category}` : ''}`,
      `${previous.period.label}: ${inr(old)} (${previousCount} transactions)`, `${result.period.label}: ${inr(current)} (${currentCount} transactions)`,
      `Change: ${delta >= 0 ? '+' : '-'}${inr(Math.abs(delta))}${old > 0 ? ` (${(delta / old * 100).toFixed(1)}%)` : ' (no nonzero baseline for a percentage)'}`, 'Confirmed ledger only.'].join('\n');
  }
  const pages = Math.max(1, Math.ceil(result.count / PAGE_SIZE));
  const heading = result.kind === 'rules' ? 'Saved category rules' : result.kind === 'review' ? 'Category reviews' : 'Matching transactions';
  const lines = [`${heading}${result.period ? ` / ${result.period.label}` : ''}`, `${result.count} matches. Page ${request.page} of ${pages}.`];
  if (request.page > pages) return `${heading}: ${result.count} matches across ${pages} pages. Choose a page from 1 to ${pages}.`;
  for (const row of result.records) {
    if (result.kind === 'rules') lines.push(`${row.category || 'Unassigned'} / priority ${row.priority}: ${row.conditions.map((c: any) => `${c.field} ${c.operator} ${c.value}`).join(' AND ')}`);
    else lines.push(`${new Date(row.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}: ${row.title} / ${row.direction} ${inr(Number(row.amount))} / ${row.category || 'Needs category'} / ${row.mode}${row.notes ? `\n${row.notes}` : ''}`);
  }
  if (!result.count) lines.push('No matching records in this period.');
  else if (request.page < pages) lines.push('More results available. Reply with the next page number to keep these filters.');
  return lines.join('\n');
}
