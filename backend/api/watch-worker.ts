import { operationQueue } from '../src/services/operationQueue';
import { connectDatabase } from '../src/server';
import { processWatch } from '../src/ai/watchService';

export default operationQueue.handleNodeCallback<{ id: string }>(async message => {
  await connectDatabase(); await processWatch(message.id);
}, { retry: (_error, metadata) => ({ afterSeconds: Math.min(300, 5 * 2 ** Math.min(metadata.deliveryCount, 6)) }) });
