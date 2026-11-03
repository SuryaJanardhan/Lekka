export type TransactionDirection = 'DEBIT' | 'CREDIT' | 'UNKNOWN';

export function explicitPostedCredit(subject: string, body: string) {
  return /\b(?:INR|Rs\.?|₹)\s*[\d,]+(?:\.\d+)?\s+was credited to (?:your )?(?:A\/c|account)\b/i.test(`${subject}\n${body}`);
}

export function nonTransactionNotice(subject: string, body: string) {
  const text = `${subject}\n${body}`;
  return /\b(?:statement of accounts?|daily margin statement|contract note|trades? executed|change in pledge handling policy|autopay for .{0,50} removed|unaudited .{0,60} financial results)\b/i.test(text);
}

export function transactionDirection(subject: string, body: string): TransactionDirection {
  const text = `${subject}\n${body}`;
  const credit = /\b(?:credited|refunded|refund (?:of|processed|successful|issued|received|credited)|cashback (?:of|received|credited)|reversal|reversed|money received|payment received|amount received|dividend|interest received)\b/i.test(text) || /\bcashback\s+(?:INR|Rs\.?|USD|\d)/i.test(text);
  const debit = /\b(?:debited|you paid|paid (?:INR|Rs\.?|USD|to)|you (?:have )?(?:spent|sent)|payment (?:of .{0,35})?(?:successful|completed)|purchase (?:of .{0,35})?(?:successful|completed)|(?:stock\s+)?SIP (?:order|investment)(?:.{0,80})?(?:successful|processed|completed)|(?:your )?investment of (?:₹|INR|Rs\.?)\s*[\d,.]+ is successful|shares? (?:have been )?(?:added to your holdings|bought)|spent (?:INR|Rs\.?)|withdrawn)\b/i.test(text);
  if (/\b(?:failed|declined|unsuccessful|pending|not (?:debited|paid|completed)|will be debited|to be debited)\b/i.test(text)) return 'UNKNOWN';
  // Mixed statements and quoted transactions need semantic review, not a guessed sign.
  if (credit && debit) return 'UNKNOWN';
  return credit ? 'CREDIT' : debit ? 'DEBIT' : 'UNKNOWN';
}
