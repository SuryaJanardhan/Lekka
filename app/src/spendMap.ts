export type BreakdownRow = { label: string; value: number; color?: string };

type SpendEntry = {
  receivedAt: string;
  categoryId?: { name?: string; colorCode?: string };
  parsedJson?: Record<string, any>;
};

export function spendMapRows(categories: BreakdownRow[], search = '') {
  const query = search.trim().toLocaleLowerCase();
  return categories.filter(row => !query || row.label.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function shareOf(value: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
}

const istDay = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
export const istMonth = (value: Date) => istDay(value).slice(0, 7);

export function ledgerMonthOptions(entries: SpendEntry[], now = new Date()) {
  const months = new Set([istMonth(now)]);
  for (const entry of entries) {
    const date = new Date(entry.receivedAt);
    if (!Number.isNaN(date.getTime())) months.add(istMonth(date));
  }
  return [...months].sort((left, right) => right.localeCompare(left));
}

export function ledgerBreakdownForIstMonth(
  entries: SpendEntry[],
  month: string,
  direction: 'DEBIT' | 'CREDIT',
  categoryCatalog: Array<{ name: string; colorCode?: string }> = []
) {
  const categories = new Map<string, BreakdownRow>();
  const modes = new Map<string, BreakdownRow>();
  const modeColors: Record<string, string> = { UPI: '#0f766e', CASH: '#2563eb', CARD: '#b45309', FRIEND_PAID: '#dc2626' };
  for (const category of categoryCatalog) categories.set(category.name, { label: category.name, value: 0, color: category.colorCode || '#9ca3af' });

  let total = 0;
  for (const entry of entries) {
    const date = new Date(entry.receivedAt);
    if (Number.isNaN(date.getTime()) || istMonth(date) !== month) continue;
    const entryDirection = entry.parsedJson?.transactionDirection === 'CREDIT' ? 'CREDIT' : 'DEBIT';
    if (entryDirection !== direction) continue;
    const amount = Number(entry.parsedJson?.detectedAmount || 0);
    if (!(amount > 0)) continue;

    const categoryName = entry.categoryId?.name || 'Unassigned';
    const category = categories.get(categoryName) || { label: categoryName, value: 0, color: entry.categoryId?.colorCode || '#9ca3af' };
    category.value += amount;
    categories.set(categoryName, category);

    const rawMode = entry.parsedJson?.paymentMode;
    const modeName = ['CASH', 'UPI', 'CARD', 'FRIEND_PAID'].includes(rawMode) ? rawMode : 'UPI';
    const mode = modes.get(modeName) || { label: modeName, value: 0, color: modeColors[modeName] };
    mode.value += amount;
    modes.set(modeName, mode);
    total += amount;
  }

  return { total, categories: spendMapRows([...categories.values()]), modes: spendMapRows([...modes.values()]) };
}

export function categorySpendForIstDay(entries: SpendEntry[], now = new Date()) {
  const day = istDay(now), rows = new Map<string, BreakdownRow>();
  for (const entry of entries) {
    if (entry.parsedJson?.transactionDirection === 'CREDIT' || istDay(new Date(entry.receivedAt)) !== day) continue;
    const label = entry.categoryId?.name || 'Unassigned', amount = Number(entry.parsedJson?.detectedAmount || 0);
    if (!(amount > 0)) continue;
    const row = rows.get(label) || { label, value: 0, color: entry.categoryId?.colorCode || '#9ca3af' };
    row.value += amount; rows.set(label, row);
  }
  return spendMapRows([...rows.values()]);
}
