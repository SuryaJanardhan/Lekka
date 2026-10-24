import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { OperationModel, StoredOperation } from '../models/Operation';
import { OperationCommand, operationError, operationHash, validateOperation } from './operationCommand';
import { executeOperation } from './operationExecutor';
import { bumpDataRevision } from './dataRevisionService';
import { PushService } from './pushService';

mongoose.set('transactionAsyncLocalStorage', true);

export function operationStatus(op: StoredOperation) {
  return { id: op._id, state: op.state, error: op.error, revision: op.revision, result: op.result, updatedAt: op.updatedAt.toISOString() };
}

export class OperationService {
  private static async deliverConfirmation(op: StoredOperation) {
    if (!op.notificationDue) return;
    const owner = randomUUID();
    const claimed = await OperationModel.findOneAndUpdate({ _id: op._id, state: 'DONE', notificationDue: true,
      $or: [{ notificationLeaseUntil: { $exists: false } }, { notificationLeaseUntil: { $lt: new Date() } }]
    }, { $set: { notificationOwner: owner, notificationLeaseUntil: new Date(Date.now() + 120000) } }, { new: true }).lean();
    if (!claimed) throw operationError('Confirmation is already processing', 425);
    try {
      if (PushService.isConfigured()) {
        const result = await PushService.send('Lekka transaction saved', `${op.payload.title}: INR ${op.payload.amount}. ${op.payload.transactionDirection === 'CREDIT' ? 'Credit' : 'Debit'} saved.`, `operation-${op._id}`, 'ledger', {
          skipInstallationIds: claimed.notificationDeliveredTo,
          onDelivered: async installationId => { await OperationModel.updateOne({ _id: op._id, notificationOwner: owner }, { $addToSet: { notificationDeliveredTo: installationId } }); }
        });
        if (result.failed) throw new Error('Transaction saved; confirmation delivery will retry');
      }
      await OperationModel.updateOne({ _id: op._id, notificationOwner: owner }, { $set: { notificationDue: false } });
    } finally {
      await OperationModel.updateOne({ _id: op._id, notificationOwner: owner }, { $unset: { notificationOwner: '', notificationLeaseUntil: '' } });
    }
  }
  static async accept(input: unknown) {
    const command = validateOperation(input);
    const hash = operationHash(command);
    if (command.predecessorId && !await OperationModel.exists({ _id: command.predecessorId })) throw operationError('Earlier operation has not reached the server. Retry in order.', 425);
    try {
      await OperationModel.updateOne({ _id: command.id }, { $setOnInsert: { ...command, _id: command.id, hash, state: 'PENDING', nextAttemptAt: new Date() } }, { upsert: true, writeConcern: { w: 'majority', j: true } });
    } catch (error: any) { if (error.code !== 11000) throw error; }
    const op = await OperationModel.findById(command.id).lean();
    if (!op || op.hash !== hash) throw operationError('Operation ID already belongs to a different change.', 409);
    return op;
  }

  static async process(id: string) {
    let op = await OperationModel.findById(id).lean();
    if (!op || ['BLOCKED', 'CANCELLED'].includes(op.state)) return;
    if (op.state === 'DONE') { await this.deliverConfirmation(op); return; }
    if (op.predecessorId) {
      const previous = await OperationModel.findById(op.predecessorId).lean();
      if (!previous || !['DONE', 'CANCELLED'].includes(previous.state)) throw operationError('Waiting for earlier change', 425);
    }
    const owner = randomUUID();
    const now = new Date();
    op = await OperationModel.findOneAndUpdate({ _id: id, nextAttemptAt: { $lte: now }, $or: [{ state: 'PENDING' }, { state: 'PROCESSING', leaseUntil: { $lt: now } }] }, {
      $set: { state: 'PROCESSING', owner, leaseUntil: new Date(now.getTime() + 60000) }, $inc: { attempts: 1 }
    }, { new: true }).lean();
    if (!op) throw operationError('Change is already processing or awaiting retry', 425);
    try {
      await mongoose.connection.transaction(async () => {
        const current = await OperationModel.findOne({ _id: id, owner, state: 'PROCESSING' }).lean();
        if (!current) throw operationError('Processing lease changed', 425);
        const result = await executeOperation(current);
        const revision = await bumpDataRevision();
        const updated = await OperationModel.updateOne({ _id: id, owner, state: 'PROCESSING' }, {
          $set: { state: 'DONE', result, revision, notificationDue: current.kind === 'entry.create' }, $unset: { owner: '', leaseUntil: '', error: '' }
        });
        if (updated.modifiedCount !== 1) throw operationError('Processing lease changed', 425);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, readPreference: 'primary', maxCommitTimeMS: 10000 });
    } catch (error: any) {
      const permanent = [400, 404, 409, 422].includes(error.status) || error.name === 'ValidationError' || error.name === 'CastError';
      await OperationModel.updateOne({ _id: id, owner, state: 'PROCESSING' }, {
        $set: { state: permanent ? 'BLOCKED' : 'PENDING', error: permanent ? error.message : 'Temporary server error. Retrying safely.', nextAttemptAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** Math.min(op.attempts, 6))) },
        $unset: { owner: '', leaseUntil: '' }
      });
      if (!permanent) throw error;
    }
    const completed = await OperationModel.findById(id).lean();
    if (completed?.state === 'DONE') await this.deliverConfirmation(completed);
  }

  static async resolve(id: string, action: 'retry' | 'discard', input?: OperationCommand) {
    if (action === 'discard' && input) {
      const structural = validateOperation({ ...input, payload: {} });
      if (structural.id !== id) throw operationError('Operation ID does not match');
      const hash = operationHash({ ...structural, payload: input.payload });
      await OperationModel.updateOne({ _id: id }, { $setOnInsert: { ...structural, _id: id, payload: {}, hash, state: 'CANCELLED' } }, { upsert: true, writeConcern: { w: 'majority', j: true } });
      const existing = await OperationModel.findById(id).lean();
      if (existing?.hash !== hash) throw operationError('Operation ID already belongs to a different change.', 409);
      if (existing.state === 'CANCELLED') return existing;
    }
    const op = await OperationModel.findOneAndUpdate({ _id: id, state: 'BLOCKED' }, {
      $set: { state: action === 'retry' ? 'PENDING' : 'CANCELLED', nextAttemptAt: new Date() }, $unset: { error: '' }
    }, { new: true }).lean();
    if (!op) throw operationError('Only a rejected change can be retried or discarded. Refresh its status.', 409);
    return op;
  }
}
