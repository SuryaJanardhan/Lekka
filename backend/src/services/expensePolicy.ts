export type TransactionDirection = 'DEBIT' | 'CREDIT' | 'UNKNOWN';

export function transactionDirection(subject: string, body: string): TransactionDirection {
  const text = `${subject}\n${body}`;
  const credit = /\b(?:credited|refunded|refund (?:of|processed|successful|issued|received|credited)|cashback (?:of|received|credited)|reversal|reversed|money received|payment received|amount received|dividend|interest received)\b/i.test(text) || /\bcashback\s+(?:INR|Rs\.?|USD|\d)/i.test(text);
  const debit = /\b(?:debited|you paid|paid (?:INR|Rs\.?|USD|to)|you (?:have )?(?:spent|sent)|payment (?:of .{0,35})?(?:successful|completed)|purchase (?:of .{0,35})?(?:successful|completed)|spent (?:INR|Rs\.?)|withdrawn)\b/i.test(text);
  if (/\b(?:failed|declined|unsuccessful|pending|not (?:debited|paid|completed)|will be debited|to be debited)\b/i.test(text)) return 'UNKNOWN';
  // Mixed statements and quoted transactions need semantic review, not a guessed sign.
  if (credit && debit) return 'UNKNOWN';
  return credit ? 'CREDIT' : debit ? 'DEBIT' : 'UNKNOWN';
}
