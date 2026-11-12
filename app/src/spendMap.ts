export type BreakdownRow = { label: string; value: number; color?: string };

export function spendMapRows(categories: BreakdownRow[], search = '') {
  const query = search.trim().toLocaleLowerCase();
  return categories.filter(row => !query || row.label.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function shareOf(value: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
}

const istDay = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
export function categorySpendForIstDay(entries: Array<{ receivedAt: string; categoryId?: { name?: string; colorCode?: string }; parsedJson?: Record<string, any> }>, now = new Date()) {
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
