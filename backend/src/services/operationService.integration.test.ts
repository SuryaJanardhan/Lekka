import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { OperationService } from './operationService';
import { OperationModel } from '../models/Operation';
import { EmailModel } from '../models/Email';
import { CategoryModel } from '../models/Category';
import { RuleModel } from '../models/Rule';
import { NotificationModel } from '../models/Notification';
import { DataRevisionModel } from '../models/DataRevision';

const uri = process.env.OPERATION_TEST_URI;
const integration = uri ? test : test.skip;
before(async () => {
  if (!uri) return;
  if (!/^mongodb:\/\/127\.0\.0\.1:27129\/lekka_operation_test(?:\?|$)/.test(uri)) throw new Error('Operation integration tests require the isolated local test replica set');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  for (const model of [OperationModel, EmailModel, CategoryModel, RuleModel, NotificationModel, DataRevisionModel]) await model.init();
});
after(async () => { if (uri && mongoose.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } });
const create = () => ({ id: randomUUID(), kind: 'entry.create', targetId: new Types.ObjectId().toHexString(), payload: { title: 'Integration payment', amount: 120, paymentMode: 'UPI', transactionDirection: 'DEBIT', date: '2026-10-24' } });

integration('timeout-after-commit replay and duplicate delivery cannot create a second transaction', async () => {
  const command = create();
  await OperationService.accept(command);
  await Promise.allSettled([OperationService.process(command.id), OperationService.process(command.id)]);
  const replay = await OperationService.accept(command);
  await OperationService.process(command.id);
  assert.equal(replay.state, 'DONE');
  assert.equal(await EmailModel.countDocuments({ _id: command.targetId }), 1);
  assert.equal((await OperationModel.findById(command.id))?.result._id, command.targetId);
  await assert.rejects(() => OperationService.accept({ ...command, payload: { ...command.payload, amount: 900 } }), /different change/);
});

integration('a failure after writing a category rolls back the category and completion receipt together', async () => {
  const revision = await DataRevisionModel.findById('app');
  const max = revision!.version;
  await mongoose.connection.db!.command({ collMod: DataRevisionModel.collection.name, validator: { version: { $lte: max } } });
  const command = { id: randomUUID(), kind: 'category.create', targetId: new Types.ObjectId().toHexString(), payload: { name: 'Rollback category' } };
  try {
    await OperationService.accept(command);
    await assert.rejects(() => OperationService.process(command.id));
    assert.equal(await CategoryModel.exists({ _id: command.targetId }), null);
    assert.equal((await OperationModel.findById(command.id))?.state, 'PENDING');
  } finally { await mongoose.connection.db!.command({ collMod: DataRevisionModel.collection.name, validator: {} }); }
  await OperationModel.updateOne({ _id: command.id }, { nextAttemptAt: new Date(0) });
  await OperationService.process(command.id);
  assert.equal((await OperationModel.findById(command.id))?.state, 'DONE');
  assert.ok(await CategoryModel.exists({ _id: command.targetId }));
});

integration('ordered creates and edits survive a lease interruption and reject stale record versions', async () => {
  const command = create();
  await OperationService.accept(command);
  const edit = { id: randomUUID(), kind: 'entry.update', targetId: command.targetId, predecessorId: command.id, expectedAfter: command.id, payload: { ...command.payload, amount: 140 } };
  await OperationService.accept(edit);
  await assert.rejects(() => OperationService.process(edit.id), /earlier change/);
  await OperationModel.updateOne({ _id: command.id }, { state: 'PROCESSING', owner: 'interrupted-worker', leaseUntil: new Date(0) });
  await OperationService.process(command.id);
  const original = await EmailModel.findById(command.targetId);
  await OperationService.process(edit.id);
  assert.equal((await EmailModel.findById(command.targetId))?.parsedJson.detectedAmount, 140);
  const stale = { id: randomUUID(), kind: 'entry.update', targetId: command.targetId, expectedUpdatedAt: original!.updatedAt.toISOString(), payload: { ...command.payload, amount: 900 } };
  await OperationService.accept(stale);
  await OperationService.process(stale.id);
  assert.equal((await OperationModel.findById(stale.id))?.state, 'BLOCKED');
  assert.equal((await EmailModel.findById(command.targetId))?.parsedJson.detectedAmount, 140);
  await OperationService.resolve(stale.id, 'discard');
  assert.equal((await OperationModel.findById(stale.id))?.state, 'CANCELLED');
});

integration('queued notification clear does not dismiss notifications created after its cutoff', async () => {
  const old = await NotificationModel.create({ title: 'Old', message: 'Old', type: 'REVIEW', createdAt: new Date('2026-10-01') });
  const recent = await NotificationModel.create({ title: 'New', message: 'New', type: 'REVIEW', createdAt: new Date('2026-10-24') });
  const command = { id: randomUUID(), kind: 'notification.clear', targetId: new Types.ObjectId().toHexString(), payload: { before: '2026-10-02T00:00:00.000Z' } };
  await OperationService.accept(command); await OperationService.process(command.id);
  assert.equal((await NotificationModel.findById(old._id))?.dismissed, true);
  assert.notEqual((await NotificationModel.findById(recent._id))?.dismissed, true);
});
