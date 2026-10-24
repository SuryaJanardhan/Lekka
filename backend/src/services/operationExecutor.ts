import { Request, Response } from 'express';
import { EmailController } from '../controllers/emailController';
import { CategoryController } from '../controllers/categoryController';
import { RuleController } from '../controllers/ruleController';
import { NotificationController } from './notificationService';
import { EmailModel } from '../models/Email';
import { CategoryModel } from '../models/Category';
import { RuleModel } from '../models/Rule';
import { OperationModel, StoredOperation } from '../models/Operation';
import { Types } from 'mongoose';
import { operationError, validateOperationPayload } from './operationCommand';

export async function executeOperation(op: StoredOperation) {
  validateOperationPayload({ ...op, id: op._id });
  if (op.kind.startsWith('entry.') && op.payload.categoryId && (!Types.ObjectId.isValid(op.payload.categoryId) || !await CategoryModel.exists({ _id: op.payload.categoryId }))) throw operationError('Category no longer exists. Choose an existing category.', 404);
  const model = op.kind.startsWith('entry.') ? EmailModel : op.kind.startsWith('category.') ? CategoryModel : op.kind.startsWith('rule.') ? RuleModel : null;
  if (model && !op.kind.endsWith('.create')) {
    const row: any = await (model as any).findById(op.targetId).lean();
    if (!row) throw operationError('Record no longer exists. Refresh and review this change.', 404);
    let expected = op.expectedUpdatedAt;
    if (op.expectedAfter) {
      const previous = await OperationModel.findById(op.expectedAfter).lean();
      if (previous?.state !== 'DONE' || previous.targetId !== op.targetId) throw operationError('An earlier change must be resolved first.', 409);
      expected = previous.result?.updatedAt;
    }
    if (!expected || new Date(row.updatedAt).toISOString() !== new Date(expected).toISOString()) throw operationError('This record changed elsewhere. Refresh before editing again.', 409);
  }
  // Reuse the existing validated command handlers, capturing their result inside the transaction.
  const req = { params: { id: op.targetId, emailId: op.targetId }, body: { ...op.payload, _id: op.targetId } } as unknown as Request;
  let status = 200;
  let body: any;
  const res = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } } as unknown as Response;
  switch (op.kind) {
    case 'entry.create': await EmailController.createManualTransaction(req, res); break;
    case 'entry.update': await EmailController.updateTransaction(req, res); break;
    case 'entry.delete': await EmailController.deleteTransaction(req, res); break;
    case 'entry.category': await EmailController.assignCategory(req, res); break;
    case 'category.create': await CategoryController.createCategory(req, res); break;
    case 'category.rename': await CategoryController.renameCategory(req, res); break;
    case 'rule.create': await RuleController.createRule(req, res); break;
    case 'rule.update': await RuleController.updateRule(req, res); break;
    case 'rule.delete': await RuleController.deleteRule(req, res); break;
    case 'notification.read': await NotificationController.markRead(req, res); break;
    case 'notification.clear': await NotificationController.clearAll(req, res); break;
  }
  if (!body || status >= 400 || body.success === false) throw operationError(body?.error || 'Could not apply change', status >= 400 ? status : 404);
  return JSON.parse(JSON.stringify(body.data ?? null));
}
