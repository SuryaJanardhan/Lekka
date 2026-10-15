export type TransactionDirection = 'DEBIT' | 'CREDIT' | 'UNKNOWN';

export function transactionDirection(subject: string, body: string): TransactionDirection {
  const text = `${subject}\n${body}`;
  const credit = /\b(?:credited|refund(?:ed)?|cashback|reversal|reversed|money received|payment received|amount received|dividend|interest received)\b/i.test(text);
  const debit = /\b(?:debited|you paid|paid (?:INR|Rs\.?|USD|to)|you (?:have )?(?:spent|sent)|payment (?:of .{0,35})?(?:successful|completed)|purchase (?:of .{0,35})?(?:successful|completed)|spent (?:INR|Rs\.?)|withdrawn)\b/i.test(text);
  // Mixed statements and quoted transactions need semantic review, not a guessed sign.
  if (credit && debit) return 'UNKNOWN';
  return credit ? 'CREDIT' : debit ? 'DEBIT' : 'UNKNOWN';
}
