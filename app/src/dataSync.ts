import type { DataSnapshot, SyncStatus } from './types';
import type { CacheMetadata } from './cacheStore';

interface SyncApi { getSnapshot(): Promise<DataSnapshot>; getSyncStatus(): Promise<SyncStatus> }
interface Cache { read(): Promise<DataSnapshot | null>; write(snapshot: DataSnapshot): Promise<void> }
interface Metadata { read(): CacheMetadata; write(meta: CacheMetadata): void }
export interface SyncResult { snapshot: DataSnapshot; network: boolean; persisted: boolean }

export function validSnapshot(value: unknown): value is DataSnapshot {
  const s = value as DataSnapshot | null;
  return Boolean(s && s.schemaVersion === 1 && typeof s.revision === 'string' && typeof s.generatedAt === 'string' &&
    Array.isArray(s.entries) && Array.isArray(s.categories) && Array.isArray(s.rules) && Array.isArray(s.notifications) && s.analytics?.summary);
}

export function indiaDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function nextCheck(status: SyncStatus, now: Date): number {
  if (!status.lastSuccessfulIngestionAt || indiaDay(new Date(status.lastSuccessfulIngestionAt)) !== indiaDay(now)) return now.getTime() + 30 * 60 * 1000;
  const shifted = new Date(now.getTime() + 330 * 60000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - 330 * 60000;
}

export class DataSync {
  private snapshot: DataSnapshot | null = null;
  private hydration: Promise<DataSnapshot | null> | null = null;
  private inFlight: Promise<SyncResult> | null = null;
  private generation = 0;
  private memoryDirty = false;
  constructor(private api: SyncApi, private cache: Cache, private metadata: Metadata, private now: () => Date = () => new Date()) {}

  private meta(): CacheMetadata { try { return this.metadata.read() || {}; } catch { return {}; } }
  private saveMeta(meta: CacheMetadata) { try { this.metadata.write(meta); } catch { this.memoryDirty = true; } }

  invalidate(pushKey?: string): boolean {
    const meta = this.meta();
    if (pushKey && meta.pushKeys?.includes(pushKey)) return false;
    this.generation++;
    this.memoryDirty = true;
    this.saveMeta({ ...meta, dirty: true, pushKeys: pushKey ? [...(meta.pushKeys || []), pushKey].slice(-64) : meta.pushKeys });
    return true;
  }

  hydrate(): Promise<DataSnapshot | null> {
    if (this.snapshot) return Promise.resolve(this.snapshot);
    if (!this.hydration) this.hydration = this.cache.read().then(value => {
      if (validSnapshot(value)) this.snapshot = value;
      return this.snapshot;
    }).catch(() => null);
    return this.hydration;
  }

  async synchronize(force = false): Promise<SyncResult> {
    if (this.inFlight) {
      const result = await this.inFlight;
      if (force && (this.memoryDirty || this.meta().dirty)) return this.synchronize(true);
      return result;
    }
    const run = this.run(force);
    this.inFlight = run;
    try { return await run; }
    finally { if (this.inFlight === run) this.inFlight = null; }
  }

  private async run(force: boolean): Promise<SyncResult> {
    await this.hydrate();
    const meta = this.meta();
    const dirty = this.memoryDirty || meta.dirty;
    if (!force && !dirty && this.snapshot && (meta.nextCheckAt || 0) > this.now().getTime()) return { snapshot: this.snapshot, network: false, persisted: true };
    if (!force && !dirty && this.snapshot) {
      const status = await this.api.getSyncStatus();
      if (status.schemaVersion !== 1 || typeof status.revision !== 'string') throw new Error('Invalid sync status');
      if (status.revision === this.snapshot.revision && this.snapshot.analytics.period?.startDate?.slice(0, 7) === this.now().toISOString().slice(0, 7)) {
        this.saveMeta({ ...this.meta(), nextCheckAt: nextCheck(status, this.now()) });
        return { snapshot: this.snapshot, network: true, persisted: true };
      }
    }
    const generation = this.generation;
    const snapshot = await this.api.getSnapshot();
    if (!validSnapshot(snapshot)) throw new Error('Incomplete server snapshot; saved data was kept');
    this.snapshot = snapshot;
    let persisted = true;
    try { await this.cache.write(snapshot); }
    catch { persisted = false; }
    const currentMeta = this.meta();
    const stillDirty = !persisted || generation !== this.generation;
    this.memoryDirty = stillDirty;
    this.saveMeta({ ...currentMeta, dirty: stillDirty, nextCheckAt: nextCheck(snapshot, this.now()) });
    return { snapshot, network: true, persisted };
  }
}
