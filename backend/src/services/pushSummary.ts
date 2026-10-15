export type DigestKind = 'morning' | 'evening';
export type DigestReport = 'review' | 'weekly' | 'monthly';
const istOffset = 330 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export function digestPeriod(kind: DigestKind, now = new Date()) {
  const local = new Date(now.getTime() + istOffset);
  const localDate = local.toISOString().slice(0, 10);
  const today = new Date(`${localDate}T00:00:00+05:30`);
  const monthStart = new Date(`${localDate.slice(0, 7)}-01T00:00:00+05:30`);
  const weekStart = new Date(today.getTime() - ((local.getUTCDay() + 6) % 7) * dayMs);
  const nextDay = new Date(local.getTime() + dayMs);
  const monthEnd = nextDay.getUTCMonth() !== local.getUTCMonth();
  const weekEnd = local.getUTCDay() === 0;
  const report: DigestReport | null = kind === 'morning' ? 'review' : monthEnd ? 'monthly' : weekEnd ? 'weekly' : null;
  const start = report === 'monthly' ? monthStart : report === 'weekly' ? weekStart : today;
  return { key: `${localDate}-${report || kind}`, report, start, end: now, monthStart, weekStart, weekEnd };
}

export interface DigestTotals {
  spend: number;
  count: number;
  monthSpend: number;
  weekSpend: number;
  pending: number;
  pendingEntries: number;
  uncategorized: number;
  emailReviews: number;
  examples: string[];
  includeWeek: boolean;
}

export function digestText(report: DigestReport, totals: DigestTotals, now = new Date()) {
  const money = (amount: number) => `INR ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  if (report === 'review') {
    const details = [];
    if (totals.pendingEntries) details.push(`${totals.pendingEntries} expenses need review or a category${totals.uncategorized ? ` (${totals.uncategorized} uncategorized)` : ''}.`);
    if (totals.emailReviews) details.push(`${totals.emailReviews} ${totals.emailReviews === 1 ? 'email needs' : 'emails need'} a manual amount check.`);
    if (totals.examples.length) details.push(totals.examples.slice(0, 2).join('; ') + '.');
    return { title: `${totals.pending} ${totals.pending === 1 ? 'item needs' : 'items need'} your review`, message: details.join(' ') };
  }
  const month = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long' }).format(now);
  const cutoff = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const title = report === 'monthly' ? `Your ${month} spending` : 'Your weekly spending';
  const period = report === 'monthly' ? 'this month' : 'this week';
  const parts = [`Recorded ${period}: ${money(totals.spend)} across ${totals.count} ${totals.count === 1 ? 'expense' : 'expenses'}.`];
  if (report === 'weekly') parts.push(`This month: ${money(totals.monthSpend)}.`);
  if (report === 'monthly' && totals.includeWeek) parts.push(`This week: ${money(totals.weekSpend)}.`);
  if (totals.pending) parts.push(`${totals.pending} items still need review.`);
  parts.push(`As of ${cutoff} IST.`);
  return { title, message: parts.join(' ') };
}
