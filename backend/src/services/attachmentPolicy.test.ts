import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldOcrAttachment } from './gmailService';

const image = (bytes: number, extra: Record<string, unknown> = {}) => ({ contentType: 'image/jpeg', content: Buffer.alloc(bytes), ...extra });
test('OCR skips small decorative, inline, related, non-image and oversized attachments', () => {
  assert.equal(shouldOcrAttachment(image(7718)), false);
  assert.equal(shouldOcrAttachment(image(20000, { disposition: 'inline' })), false);
  assert.equal(shouldOcrAttachment(image(20000, { related: true })), false);
  assert.equal(shouldOcrAttachment({ contentType: 'application/pdf', content: Buffer.alloc(20000) }), false);
  assert.equal(shouldOcrAttachment(image(5 * 1024 * 1024 + 1)), false);
});
test('OCR keeps bounded non-inline receipt images', () => {
  assert.equal(shouldOcrAttachment(image(15000, { filename: 'receipt.jpg', disposition: 'attachment' })), true);
});
