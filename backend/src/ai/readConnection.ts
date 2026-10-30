import { MongoClient, Db } from 'mongodb';
import { aiError } from './contract';

let client: MongoClient | undefined;
let connecting: Promise<Db> | undefined;

export async function aiReadDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_READONLY_URI?.trim();
  if (!uri) throw aiError('AI skills need a separate read-only database connection. Configure MONGODB_READONLY_URI.', 503);
  if (uri === process.env.MONGODB_URI?.trim()) throw aiError('AI read connection must use a separate read-only database user.', 503);
  if (!connecting) {
    client = new MongoClient(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 5000 });
    connecting = client.connect().then(async connected => {
      const db = connected.db();
      const status = await db.command({ connectionStatus: 1, showPrivileges: true });
      const privileges = status.authInfo?.authenticatedUserPrivileges || [];
      const readActions = new Set(['find', 'changeStream', 'collStats', 'dbHash', 'dbStats', 'killCursors', 'listCollections', 'listIndexes', 'listSearchIndexes', 'planCacheRead']);
      if (!privileges.length || privileges.some((privilege: any) => !privilege.actions?.length || privilege.actions.some((action: string) => !readActions.has(action)))) throw aiError('AI database credential is not strictly read-only. Remove write/admin privileges.', 503);
      return db;
    }).catch(async error => { connecting = undefined; await client?.close(); throw error?.status ? error : aiError('Read-only database unavailable. Check its credentials and database access.', 503); });
  }
  return connecting;
}

export async function closeAiReadConnection() { await client?.close(); client = undefined; connecting = undefined; }
