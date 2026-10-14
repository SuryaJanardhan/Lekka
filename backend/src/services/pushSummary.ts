export type DigestKind = 'morning' | 'evening';
const istOffset = 330 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export function digestPeriod(kind: DigestKind, now = new Date()) {
  const localDate = new Date(now.getTime() + istOffset).toISOString().slice(0, 10);
  const today = new Date(`${localDate}T00:00:00+05:30`);
  const start = kind === 'morning' ? new Date(today.getTime() - dayMs) : today;
  const end = kind === 'morning' ? today : now;
  const monthStart = new Date(`${localDate.slice(0, 7)}-01T00:00:00+05:30`);
  return { key: `${localDate}-${kind}`, start, end, monthStart };
}

export function digestText(kind: DigestKind, totals: { spend: number; count: number; monthSpend: number; pending: number }) {
  const money = (amount: number) => `INR ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const period = kind === 'morning' ? 'Yesterday' : 'Today';
  const title = kind === 'morning' ? 'Your morning money check' : 'Your evening ledger check';
  const message = `${period}: ${money(totals.spend)} across ${totals.count} ${totals.count === 1 ? 'expense' : 'expenses'}. This month: ${money(totals.monthSpend)}. ${totals.pending ? `${totals.pending} ${totals.pending === 1 ? 'item needs' : 'items need'} review.` : 'Nothing pending for review.'}`;
  return { title, message };
}
