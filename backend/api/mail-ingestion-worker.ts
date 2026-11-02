import { operationQueue } from '../src/services/operationQueue';
import { connectDatabase } from '../src/server';
import { processMailIngestionRun } from '../src/services/mailIngestionQueue';

export default operationQueue.handleNodeCallback<{ id: string }>(async message => {
  await connectDatabase();
  await processMailIngestionRun(message.id);
}, { retry: (_error, metadata) => ({ afterSeconds: Math.min(300, 10 * 2 ** Math.min(metadata.deliveryCount, 5)) }) });
