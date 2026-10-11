export function money(value: number | undefined | null) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function moneyExact(value: number | undefined | null) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function shortDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function timeAgo(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / 36e5);
  if (diffHours < 1) return 'now';
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

export function amountOf(entry: { parsedJson?: Record<string, any> }) {
  return Number(entry.parsedJson?.detectedAmount || 0);
}
