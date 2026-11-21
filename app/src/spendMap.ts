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

function distinctStatsCategoryColors(rows: BreakdownRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = (row.color || '#9ca3af').toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const used = new Set(rows.filter(row => (counts.get((row.color || '#9ca3af').toLowerCase()) || 0) === 1)
    .map(row => (row.color || '#9ca3af').toLowerCase()));
  return rows.map(row => {
    const original = row.color || '#9ca3af';
    if ((counts.get(original.toLowerCase()) || 0) === 1) return row;
    let hash = 0;
    for (const character of row.label.toLocaleLowerCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    let hue = hash % 360;
    let color = `hsl(${hue} 68% 42%)`;
    while (used.has(color)) {
      hue = (hue + 137) % 360;
      color = `hsl(${hue} 68% 42%)`;
    }
    used.add(color);
    return { ...row, color };
  });
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

  return { total, categories: spendMapRows(distinctStatsCategoryColors([...categories.values()])), modes: spendMapRows([...modes.values()]) };
}

export interface WeekDayOption {
  key: string;
  weekday: string;
  dayNum: number;
  formattedDate: string;
  isToday: boolean;
  totalSpend: number;
}

export function categorySpendForIstDay(entries: SpendEntry[], dayOrDate: string | Date = new Date()) {
  const day = typeof dayOrDate === 'string' ? dayOrDate : istDay(dayOrDate);
  const rows = new Map<string, BreakdownRow>();
  for (const entry of entries) {
    if (entry.parsedJson?.transactionDirection === 'CREDIT' || istDay(new Date(entry.receivedAt)) !== day) continue;
    const label = entry.categoryId?.name || 'Unassigned', amount = Number(entry.parsedJson?.detectedAmount || 0);
    if (!(amount > 0)) continue;
    const row = rows.get(label) || { label, value: 0, color: entry.categoryId?.colorCode || '#9ca3af' };
    row.value += amount; rows.set(label, row);
  }
  return spendMapRows([...rows.values()]);
}

export function categorySpendForIstRange(entries: SpendEntry[], startDay: string, endDay: string) {
  const rows = new Map<string, BreakdownRow>();
  for (const entry of entries) {
    const entryDay = istDay(new Date(entry.receivedAt));
    if (entry.parsedJson?.transactionDirection === 'CREDIT' || entryDay < startDay || entryDay > endDay) continue;
    const label = entry.categoryId?.name || 'Unassigned', amount = Number(entry.parsedJson?.detectedAmount || 0);
    if (!(amount > 0)) continue;
    const row = rows.get(label) || { label, value: 0, color: entry.categoryId?.colorCode || '#9ca3af' };
    row.value += amount; rows.set(label, row);
  }
  return spendMapRows([...rows.values()]);
}

export function currentWeekDaysForIst(entries: SpendEntry[], now = new Date()): { days: WeekDayOption[]; startDay: string; endDay: string; weekTotal: number } {
  const nowDayStr = istDay(now);
  const [y, m, d] = nowDayStr.split('-').map(Number);
  const currentCal = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = (currentCal.getUTCDay() + 6) % 7;
  const monday = new Date(currentCal.getTime() - dayOfWeek * 86400000);
  const days: WeekDayOption[] = [];
  const dayTotals = new Map<string, number>();

  for (const entry of entries) {
    if (entry.parsedJson?.transactionDirection === 'CREDIT') continue;
    const amount = Number(entry.parsedJson?.detectedAmount || 0);
    if (!(amount > 0)) continue;
    const day = istDay(new Date(entry.receivedAt));
    dayTotals.set(day, (dayTotals.get(day) || 0) + amount);
  }

  let weekTotal = 0;
  for (let i = 0; i < 7; i++) {
    const dayCal = new Date(monday.getTime() + i * 86400000);
    const dayStr = istDay(dayCal);
    const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(dayCal);
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';
    const dayNum = Number(parts.find(p => p.type === 'day')?.value || '0');
    const month = parts.find(p => p.type === 'month')?.value || '';
    const totalSpend = dayTotals.get(dayStr) || 0;
    weekTotal += totalSpend;
    days.push({
      key: dayStr,
      weekday,
      dayNum,
      formattedDate: `${dayNum} ${month}`,
      isToday: dayStr === nowDayStr,
      totalSpend
    });
  }

  return { days, startDay: days[0].key, endDay: days[6].key, weekTotal };
}
