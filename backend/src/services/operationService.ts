import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { OperationModel, StoredOperation } from '../models/Operation';
import { OperationCommand, operationError, operationHash, validateOperation } from './operationCommand';
import { executeOperation } from './operationExecutor';
import { bumpDataRevision } from './dataRevisionService';

mongoose.set('transactionAsyncLocalStorage', true);

export function operationStatus(op: StoredOperation) {
  return { id: op._id, state: op.state, error: op.error, revision: op.revision, result: op.result, updatedAt: op.updatedAt.toISOString() };
}

export class OperationService {
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
    if (!op || ['DONE', 'BLOCKED', 'CANCELLED'].includes(op.state)) return;
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
          $set: { state: 'DONE', result, revision }, $unset: { owner: '', leaseUntil: '', error: '' }
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
  }

  static async resolve(id: string, action: 'retry' | 'discard') {
    const op = await OperationModel.findOneAndUpdate({ _id: id, state: 'BLOCKED' }, {
      $set: { state: action === 'retry' ? 'PENDING' : 'CANCELLED', nextAttemptAt: new Date() }, $unset: { error: '' }
    }, { new: true }).lean();
    if (!op) throw operationError('Only a rejected change can be retried or discarded. Refresh its status.', 409);
    return op;
  }
}
