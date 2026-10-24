import { operationQueue } from '../src/services/operationQueue';
import { OperationService } from '../src/services/operationService';
import { connectDatabase } from '../src/server';

export default operationQueue.handleNodeCallback<{ id: string }>(async message => {
  await connectDatabase();
  await OperationService.process(message.id);
}, { retry: (_error, metadata) => ({ afterSeconds: Math.min(300, 5 * 2 ** Math.min(metadata.deliveryCount, 6)) }) });
