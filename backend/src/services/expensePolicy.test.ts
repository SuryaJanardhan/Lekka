import test from 'node:test';
import assert from 'node:assert/strict';
import { transactionDirection } from './expensePolicy';
import { learningConditions } from './categoryLearning';

test('credits, refunds, income and reversals are not spending', () => {
  for (const body of ['INR 200 credited to your account', 'Refund of INR 50 processed', 'Cashback INR 10', 'Payment received INR 90', 'Dividend INR 100', 'Transaction reversed INR 200']) {
    assert.equal(transactionDirection('Bank update', body), 'CREDIT', body);
  }
});
test('completed debits are spending, a credit card name alone is not a credit', () => {
  for (const body of ['Your credit card was debited INR 200', 'You paid INR 25 to Shop', 'Paid INR 123.45 to Lekka Test Shop', 'Payment successful INR 90']) {
    assert.equal(transactionDirection('Receipt', body), 'DEBIT', body);
  }
});
test('bills, balances, mixed statements and failures are not confirmed debits', () => {
  for (const body of ['Available balance INR 100', 'Invoice total INR 200 due tomorrow', 'INR 200 debited and INR 50 refunded', 'Payment failed INR 100', 'INR 200 will be debited tomorrow', 'Payment successful? No, payment failed INR 100']) {
    assert.equal(transactionDirection('Account information', body), 'UNKNOWN', body);
  }
});
test('refund policy text does not turn a completed purchase into a credit', () => {
  assert.equal(transactionDirection('Receipt', 'You paid INR 200 to Shop. Refund policy: contact support.'), 'DEBIT');
});
test('learned categories always include exact sender and merchant or exact subject', () => {
  assert.deepEqual(learningConditions('BANK@example.com', 'Payment received', 'Shop', 'Paid INR 25 to Shop'), [
    { field: 'sender', operator: 'equals', value: 'bank@example.com' },
    { field: 'body', operator: 'contains', value: 'Shop' },
    { field: 'direction', operator: 'equals', value: 'DEBIT' }
  ]);
  assert.deepEqual(learningConditions('bank@example.com', 'Receipt 123', 'Invented', 'No merchant here')[1],
    { field: 'subject', operator: 'equals', value: 'Receipt 123' });
});
