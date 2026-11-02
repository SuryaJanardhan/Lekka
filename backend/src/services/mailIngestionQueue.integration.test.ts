import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MailIngestionRunModel } from '../models/MailIngestionRun';
import { JobRunModel } from '../models/JobRun';
import { GmailService, IngestionResult } from './gmailService';
import { operationQueue } from './operationQueue';
import { notificationService } from './notificationService';
import { processMailIngestionRun, recoverMailIngestions, scheduleMailIngestion } from './mailIngestionQueue';

const uri = process.env.MAIL_QUEUE_TEST_URI;
const integration = uri ? test : test.skip;
before(async () => {
  if (!uri) return;
  if (!/^mongodb:\/\/test-admin:isolated-ai-test-only@127\.0\.0\.1:27130\/lekka_mail_queue_test(?:\?|$)/.test(uri)) throw Error('Mail queue integration tests require the isolated local replica set');
  await mongoose.connect(uri); await mongoose.connection.dropDatabase();
  await MailIngestionRunModel.init(); await JobRunModel.init();
});
after(async () => { if (uri && mongoose.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } });
const result = (hasMore: boolean, amount: number): IngestionResult => ({
  totalProcessed: 1, newIngested: 1, duplicatesSkipped: 0, needsReviewCount: 0, notificationOnlyCount: 0,
  debitsAdded: 1, creditsAdded: 0, diagnostics: { hasMore }, processedEmails: [{ messageId: String(amount), sender: 'bank', subject: 'Paid', receivedAt: new Date(), result: 'expense_saved', isTest: false }]
});

integration('durable ingestion processes one small checkpointed batch and publishes continuation until complete', async t => {
  const sent: string[] = [], alerts: any[] = [], results = [result(true, 10), result(false, 20)];
  t.mock.method(operationQueue, 'send', async (_topic: string, message: any) => { sent.push(message.id); return { messageId: String(sent.length) } as any; });
  t.mock.method(GmailService, 'processIngestionPipeline', async (_source: 'manual' | 'automatic', limit: number, notify: boolean) => { assert.equal(limit, 1); assert.equal(notify, false); return results.shift()!; });
  t.mock.method(notificationService, 'addNotification', async (...args: any[]) => { alerts.push(args); return {} as any; });
  await JobRunModel.create({ job: 'gmail-ingestion', source: 'VERCEL_CRON', status: 'RUNNING', startedAt: new Date(Date.now() - 3600000) });
  const [first, raced] = await Promise.all([scheduleMailIngestion('MANUAL'), scheduleMailIngestion('VERCEL_CRON')]);
  assert.equal(first.runId, raced.runId); assert.equal(await MailIngestionRunModel.countDocuments({ state: { $ne: 'DONE' } }), 1);
  assert.equal((await JobRunModel.findOne({ startedAt: { $lt: new Date(Date.now() - 600000) } }))?.status, 'FAILED');
  await processMailIngestionRun(first.runId);
  let run: any = await MailIngestionRunModel.findById(first.runId).lean();
  assert.equal(run.state, 'PENDING'); assert.equal(run.batches, 1); assert.equal(run.totals.newIngested, 1); assert.equal(alerts.length, 0);
  await processMailIngestionRun(first.runId);
  run = await MailIngestionRunModel.findById(first.runId).lean();
  assert.equal(run.state, 'DONE'); assert.equal(run.batches, 2); assert.equal(run.totals.newIngested, 2); assert.equal(run.activeKey, undefined);
  assert.equal(alerts.length, 1); assert.match(alerts[0][1], /2 transactions added/); assert.ok(sent.length >= 3);
  await processMailIngestionRun(first.runId); assert.equal(alerts.length, 1);
});

integration('expired processing leases remain recoverable', async t => {
  const sent: string[] = [];
  t.mock.method(operationQueue, 'send', async (_topic: string, message: any) => { sent.push(message.id); return { messageId: 'recover' } as any; });
  const run = await MailIngestionRunModel.create({ _id: 'expired-run', source: 'MANUAL', state: 'PROCESSING', activeKey: 'gmail', leaseUntil: new Date(0), publishedAt: new Date(0) });
  await recoverMailIngestions(); assert.deepEqual(sent, [String(run._id)]);
});
