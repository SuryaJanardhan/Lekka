import { Category, DashboardStats, EmailRecord, NotificationItem, Rule, DataSnapshot, SyncStatus } from './types';
import type { OperationCommand, OperationReceipt } from './outboxTypes';

export interface ApiClientConfig {
  baseUrl: string;
  apiSecret: string;
  onDataWrite?: () => void;
}

export class ApiClient {
  private baseUrl: string;
  private apiSecret: string;
  private onDataWrite?: () => void;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
    this.apiSecret = config.apiSecret;
    this.onDataWrite = config.onDataWrite;
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      'X-API-SECRET': this.apiSecret
    };
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (options.method && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(options.method) &&
      (/^\/api\/(emails|categories|rules|ingest)(\/|$)/.test(path) || /^\/api\/notifications\/(clear|[^/]+\/read)$/.test(path))) this.onDataWrite?.();
    if (!this.baseUrl) {
      throw new Error('Backend URL is not configured');
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), path === '/api/chat' ? 45000 : 15000);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.headers(),
          ...(options.headers || {})
        }
      });
    } catch (error: any) {
      throw new Error(`${path} network failed: ${error?.name === 'AbortError' ? 'timeout' : error?.message || 'Failed to fetch'}`);
    } finally {
      window.clearTimeout(timeout);
    }

    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false) {
      throw Object.assign(new Error(json.error || json.message || `Request failed: ${response.status}`), { status: response.status });
    }

    return json.data ?? json;
  }

  async health() {
    if (!this.baseUrl) return { connected: false };
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      if (!response.ok) return { connected: false, status: response.status };
      return response.json();
    } catch (error: any) {
      throw new Error(`/health network failed: ${error?.name === 'AbortError' ? 'timeout' : error?.message || 'Failed to fetch'}`);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  getCategories() {
    return this.request<Category[]>('/api/categories');
  }

  getSnapshot() { return this.request<DataSnapshot>('/api/sync/snapshot?includeCredits=true'); }
  getSyncStatus() { return this.request<SyncStatus>('/api/sync/status'); }

  renameCategory(id: string, name: string) {
    return this.request<Category>(`/api/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  }

  createCategory(name: string) {
    return this.request<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name, colorCode: '#0f766e' }) });
  }

  getEntries(params: { needsReview?: boolean; search?: string; categoryId?: string } = {}) {
    const query = new URLSearchParams();
    query.set('includeCredits', 'true');
    if (params.needsReview) query.set('needsReview', 'true');
    if (params.search) query.set('search', params.search);
    if (params.categoryId) query.set('categoryId', params.categoryId);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<EmailRecord[]>(`/api/emails${suffix}`);
  }

  getAnalytics() {
    return this.request<DashboardStats>('/api/analytics');
  }

  getRules() {
    return this.request<Rule[]>('/api/rules');
  }

  getNotifications() {
    return this.request<NotificationItem[]>('/api/notifications?includeCredits=true');
  }

  markNotificationRead(id: string) {
    return this.request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  }

  clearNotifications() {
    return this.request<{ cleared: number }>('/api/notifications/clear', { method: 'POST' });
  }

  pushStatus(installationId: string) {
    return this.request<{ configured: boolean; registered: boolean }>(`/api/notifications/push-status?installationId=${encodeURIComponent(installationId)}`);
  }

  registerPushDevice(installationId: string, token: string) {
    return this.request<{ registered: boolean; configured?: boolean }>('/api/notifications/devices', { method: 'POST', body: JSON.stringify({ installationId, token }) });
  }

  unregisterPushDevice(installationId: string) {
    return this.request(`/api/notifications/devices/${encodeURIComponent(installationId)}`, { method: 'DELETE' });
  }

  syncGmail() {
    return this.request<{ newIngested: number; notificationOnlyCount: number; duplicatesSkipped: number }>('/api/ingest', {
      method: 'POST'
    });
  }

  createManualEntry(payload: Record<string, any>) {
    return this.request<EmailRecord>('/api/emails/manual', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  updateEntry(entryId: string, payload: Record<string, any>) {
    return this.request<EmailRecord>(`/api/emails/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  deleteEntry(entryId: string) {
    return this.request(`/api/emails/${entryId}`, { method: 'DELETE' });
  }

  assignCategory(entryId: string, categoryId: string) {
    return this.request<EmailRecord>(`/api/emails/${entryId}/category`, {
      method: 'POST',
      body: JSON.stringify({ categoryId, createAutoRule: true })
    });
  }

  createRule(payload: Record<string, any>) {
    return this.request<Rule>('/api/rules', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  deleteRule(id: string) {
    return this.request(`/api/rules/${id}`, { method: 'DELETE' });
  }

  updateRule(id: string, payload: Record<string, any>) {
    return this.request<Rule>(`/api/rules/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }

  sendChatMessage(payload: { sessionId: string; message: string; clientState?: Record<string, any>; history?: Array<{ role: string; content: string }> }) {
    return this.request<{ reply: string; toolUsed?: string | null }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        ...payload
      })
    });
  }

  async exportContext() {
    return this.request<Record<string, any>>('/api/export');
  }
  aiStatus() { return this.request<any>('/api/ai/status'); }

  submitOperation(command: OperationCommand) {
    return this.request<OperationReceipt>('/api/operations', { method: 'POST', body: JSON.stringify(command) });
  }
  operationStatuses(ids: string[]) {
    return this.request<OperationReceipt[]>(`/api/operations?ids=${encodeURIComponent(ids.join(','))}`);
  }
  resolveOperation(id: string, action: 'retry' | 'discard', command: OperationCommand) {
    return this.request<OperationReceipt>(`/api/operations/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: JSON.stringify({ action, command }) });
  }
}
