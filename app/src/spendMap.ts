export type BreakdownRow = { label: string; value: number; color?: string };

export function spendMapRows(categories: BreakdownRow[], search = '') {
  const query = search.trim().toLocaleLowerCase();
  return categories.filter(row => !query || row.label.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function shareOf(value: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
}
