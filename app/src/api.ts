import { Category, DashboardStats, EmailRecord, NotificationItem, Rule } from './types';

export interface ApiClientConfig {
  baseUrl: string;
  apiSecret: string;
}

export class ApiClient {
  private baseUrl: string;
  private apiSecret: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
    this.apiSecret = config.apiSecret;
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      'X-API-SECRET': this.apiSecret
    };
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Backend URL is not configured');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...this.headers(),
        ...(options.headers || {})
      }
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false) {
      throw new Error(json.error || json.message || `Request failed: ${response.status}`);
    }

    return json.data ?? json;
  }

  async health() {
    if (!this.baseUrl) return { connected: false };
    const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { connected: false };
    return response.json();
  }

  getCategories() {
    return this.request<Category[]>('/api/categories');
  }

  getEntries(params: { needsReview?: boolean; search?: string; categoryId?: string } = {}) {
    const query = new URLSearchParams();
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
    return this.request<NotificationItem[]>('/api/notifications');
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

  async exportContext() {
    return this.request<Record<string, any>>('/api/export');
  }
}
