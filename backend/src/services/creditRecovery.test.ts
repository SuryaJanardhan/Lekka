import test from 'node:test';
import assert from 'node:assert/strict';
import { GmailService } from './gmailService';
import { ProcessedMailModel } from '../models/ProcessedMail';
import { SyncStateModel } from '../models/SyncState';
import * as inbox from './imapInbox';

test('legacy credit recovery only processes ignored credit IDs and does not rewind the daily cursor', async t => {
  t.mock.method(ProcessedMailModel, 'find', () => ({ select() { return this; }, lean: async () => [{ messageId: 'old-credit' }] }));
  t.mock.method(inbox, 'scanImapInbox', async () => ({ mails: [{ messageId: 'old-credit' }, { messageId: 'new-debit' }] }));
  const cursor = t.mock.method(SyncStateModel, 'updateOne', async () => { throw Error('Cursor must not change'); });
  const previous = Reflect.get(GmailService, 'processIncomingMails');
  let ids: string[] = [];
  Reflect.set(GmailService, 'processIncomingMails', async (mails: any[]) => { ids = mails.map(mail => mail.messageId); return { creditsAdded: 1, needsReviewCount: 1 }; });
  t.after(() => Reflect.set(GmailService, 'processIncomingMails', previous));
  const result = await GmailService.recoverIgnoredCredits();
  assert.deepEqual(ids, ['old-credit']);
  assert.equal(result.recovered, 1);
  assert.equal(cursor.mock.callCount(), 0);
});
