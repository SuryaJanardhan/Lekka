import { createHash } from 'crypto';
import { inr } from './formatReply';

export interface WatchFinding { id: string; kind: 'duplicate' | 'large' | 'growth'; message: string }
export function detectWatchFindings(data: { recent: any[]; average: number; baselineCount: number; growth: any[]; categories: any[] }): WatchFinding[] {
  const findings: WatchFinding[] = [];
  const add = (kind: WatchFinding['kind'], key: string, message: string) => {
    const id = createHash('sha256').update(`${kind}:${key}`).digest('hex');
    if (!findings.some(row => row.id === id)) findings.push({ id, kind, message });
  };
  const amounts = (row: any) => Math.round(Number(row.parsedJson?.detectedAmount || 0) * 100);
  const merchant = (row: any) => String(row.parsedJson?.merchantName || row.subject || '').trim().toLowerCase();
  for (let i = 0; i < data.recent.length && findings.length < 3; i++) {
    const row = data.recent[i], amount = amounts(row), name = String(row.parsedJson?.merchantName || row.subject || '').slice(0, 65);
    if (!(amount > 0)) continue;
    for (let j = i + 1; j < data.recent.length; j++) {
      const other = data.recent[j];
      if (amount === amounts(other) && merchant(row) && merchant(row) === merchant(other) && Math.abs(new Date(row.receivedAt).getTime() - new Date(other.receivedAt).getTime()) <= 600000) {
        add('duplicate', [String(row._id), String(other._id)].sort().join(':'), `Possible duplicate: ${name}, ${inr(amount)}, two receipts within 10 minutes. These may be legitimate separate payments.`); break;
      }
    }
    if (findings.length < 3 && data.baselineCount >= 5 && amount >= 100000 && amount > data.average * 3) add('large', String(row._id), `Larger than your recent average: ${name}, ${inr(amount)}; baseline ${inr(Math.round(data.average))} across ${data.baselineCount} earlier debits.`);
  }
  const changedCategories = new Set(data.recent.map(row => String(row.categoryId || '')));
  for (const row of data.growth.filter(row => row._id.current)) {
    if (findings.length >= 3) break;
    const id = String(row._id.category || ''); if (!changedCategories.has(id)) continue;
    const old = data.growth.find(other => !other._id.current && String(other._id.category || '') === id);
    if (!old || old.count < 3 || !(Number(old.amount) > 0) || Number(row.amount) < 2 * Number(old.amount) || Number(row.amount) - Number(old.amount) < 100000) continue;
    const category = data.categories.find(category => String(category._id) === id)?.name || 'Unassigned';
    add('growth', `${id}:${Number(row.amount)}:${Number(old.amount)}`, `${category}: ${inr(Number(row.amount))} in the latest seven calendar days versus ${inr(Number(old.amount))} in the prior seven. Latest period may be incomplete.`);
  }
  return findings.slice(0, 3);
}
