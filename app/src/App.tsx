import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  BarChart3,
  Bell,
  Bot,
  ChevronRight,
  Fingerprint,
  ListFilter,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Tag,
  Trash2,
  Wallet
} from 'lucide-react';
import {
  AndroidBiometryStrength,
  BiometricAuth,
  BiometryError,
  BiometryErrorType
} from '@aparajita/capacitor-biometric-auth';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ApiClient } from './api';
import { Category, DashboardStats, EmailRecord, NotificationItem, Rule } from './types';
import { amountOf, money, moneyExact, shortDate, timeAgo } from './format';

type Tab = 'today' | 'ledger' | 'add' | 'review' | 'insights' | 'rules' | 'settings' | 'ai';
type PaymentMode = 'CASH' | 'FRIEND_PAID' | 'UPI' | 'CARD';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const apiSecret = import.meta.env.VITE_LEKKA_API_SECRET || '';
const backendUrl = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const notificationChannelId = 'lekka_alerts';
let notificationChannelReady = false;
const defaultCategory: Category = {
  _id: 'all',
  name: 'All',
  slug: 'all',
  colorCode: '#0f766e',
  createdSource: 'SYSTEM'
};

export function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinMood, setPinMood] = useState<'idle' | 'success' | 'error'>('idle');
  const [savedPin, setSavedPin] = useState(() => localStorage.getItem('lekka_app_pin') || '1234');
  const [biometricEnabled, setBiometricEnabled] = useState(() => localStorage.getItem('lekka_biometric_enabled') === 'true');
  const [tab, setTab] = useState<Tab>('today');
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  const [entries, setEntries] = useState<EmailRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([defaultCategory]);
  const [analytics, setAnalytics] = useState<DashboardStats | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<EmailRecord | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lekka_debug_logs') || '[]');
    } catch {
      return [];
    }
  });

  const [manual, setManual] = useState({
    title: '',
    amount: '',
    paymentMode: 'CASH' as PaymentMode,
    friendName: '',
    categoryId: '',
    date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  const [rule, setRule] = useState({
    field: 'subject',
    operator: 'contains',
    value: '',
    categoryId: '',
    customCategoryName: ''
  });

  const [pinForm, setPinForm] = useState({ current: '', next: '', confirm: '' });

  const api = useMemo(() => new ApiClient({ baseUrl: backendUrl, apiSecret }), []);

  const logEvent = (label: string, detail = '') => {
    const line = `${new Date().toISOString()} ${label}${detail ? `: ${detail}` : ''}`;
    setDebugLogs((prev) => {
      const next = [line, ...prev].slice(0, 80);
      localStorage.setItem('lekka_debug_logs', JSON.stringify(next));
      return next;
    });
  };

  const ensureLocalNotifications = async () => {
    if (!Capacitor.isNativePlatform()) return false;

    if (!notificationChannelReady) {
      await LocalNotifications.createChannel({
        id: notificationChannelId,
        name: 'Lekka alerts',
        description: 'Sync, review, and expense confirmations',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#14B8A6'
      });
      notificationChannelReady = true;
    }

    let permissions = await LocalNotifications.checkPermissions();
    if (permissions.display !== 'granted') {
      permissions = await LocalNotifications.requestPermissions();
    }

    if (permissions.display !== 'granted') {
      throw new Error('Android notification permission is not granted');
    }

    return true;
  };

  const sendDeviceNotification = async (title: string, message: string) => {
    try {
      if (await ensureLocalNotifications()) {
        await LocalNotifications.schedule({
          notifications: [{
            title,
            body: message,
            id: Date.now() % 2147483647,
            channelId: notificationChannelId,
            smallIcon: 'ic_stat_lekka',
            iconColor: '#14B8A6',
            autoCancel: true
          }]
        });
        return;
      }

      if ('Notification' in window) {
        if (Notification.permission === 'default') await Notification.requestPermission();
        if (Notification.permission === 'granted') new Notification(title, { body: message });
      }
    } catch (error: any) {
      setToast(error.message || 'Notification failed');
    }
  };

  const showToast = async (message: string, title = 'Lekka', notify = false) => {
    setToast(message);
    if (notify) await sendDeviceNotification(title, message);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const [categoryData, entryData, reportData, ruleData, notificationData] = await Promise.all([
        api.getCategories(),
        api.getEntries(),
        api.getAnalytics(),
        api.getRules(),
        api.getNotifications()
      ]);
      const usableCategories = [defaultCategory, ...categoryData];
      setCategories(usableCategories);
      setEntries(entryData);
      setAnalytics(reportData);
      setRules(ruleData);
      setNotifications(notificationData);
      setManual((prev) => ({ ...prev, categoryId: prev.categoryId || categoryData[0]?._id || '' }));
      setRule((prev) => ({ ...prev, categoryId: prev.categoryId || categoryData[0]?._id || '' }));
      logEvent('refresh ok', `${entryData.length} entries`);
    } catch (error: any) {
      logEvent('refresh failed', error.message || 'unknown');
      showToast(error.message || 'Backend data refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const checkConnection = async () => {
    setConnection('checking');
    try {
      const health = await api.health();
      setConnection(health?.databaseConnected ? 'online' : 'offline');
      logEvent('backend health', `${health?.databaseConnected ? 'online' : 'offline'} ${health?.status ? `status ${health.status}` : ''}`.trim());
    } catch (error: any) {
      setConnection('offline');
      logEvent('backend health failed', error.message || 'unknown');
    }
  };

  useEffect(() => {
    logEvent('app backend url', api.getBaseUrl() || '<empty>');
    checkConnection();
  }, []);

  useEffect(() => {
    if (isUnlocked) refresh();
  }, [isUnlocked]);

  const totals = useMemo(() => {
    const monthTotal = analytics?.summary.totalFinancialAmount || 0;
    const cash = analytics?.paymentModeBreakdown?.find((item) => item.mode === 'CASH')?.totalAmount || 0;
    const friend = analytics?.paymentModeBreakdown?.find((item) => item.mode === 'FRIEND_PAID')?.totalAmount || 0;
    const pending = entries.filter((entry) => entry.needsUserReview).length;
    return { monthTotal, cash, friend, online: monthTotal - cash - friend, pending };
  }, [analytics, entries]);

  const periodTotals = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startWeek = new Date(now);
    startWeek.setDate(now.getDate() - 6);
    startWeek.setHours(0, 0, 0, 0);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime();
    const startYear = new Date(now.getFullYear(), 0, 1).getTime();
    const sumFrom = (start: number) => entries.reduce((sum, entry) => {
      const date = new Date(entry.receivedAt).getTime();
      return date >= start ? sum + amountOf(entry) : sum;
    }, 0);
    return {
      today: sumFrom(startToday),
      week: sumFrom(startWeek.getTime()),
      month: sumFrom(startMonth),
      quarter: sumFrom(startQuarter),
      year: sumFrom(startYear)
    };
  }, [entries]);

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch = search.trim()
      ? `${entry.sender} ${entry.subject} ${entry.rawTextBody}`.toLowerCase().includes(search.toLowerCase())
      : true;
    const matchesCategory = categoryFilter === 'all' || entry.categoryId?._id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const reviewEntries = entries.filter((entry) => entry.needsUserReview);

  const unlockWithPin = (value: string) => {
    if (value === savedPin) {
      setPinMood('success');
      setTimeout(() => {
        setIsUnlocked(true);
        setPin('');
        setPinMood('idle');
      }, 320);
      showToast('Unlocked');
      return;
    }
    setPinMood('error');
    setToast('Wrong PIN');
    setTimeout(() => {
      setPin('');
      setPinMood('idle');
    }, 520);
  };

  const enterPin = (key: string) => {
    if (pinMood !== 'idle') return;
    const next = `${pin}${key}`;
    setPin(next);
    if (next.length === 4) unlockWithPin(next);
  };

  const biometricUnlock = async () => {
    if (!biometricEnabled) {
      showToast('Enable biometrics in Settings after unlocking once');
      return;
    }
    try {
      const check = await BiometricAuth.checkBiometry();
      if (!check.isAvailable) {
        showToast(check.reason || 'No enrolled biometric is available for this app');
        return;
      }

      await BiometricAuth.authenticate({
        reason: 'Use your fingerprint or face to unlock Lekka',
        cancelTitle: 'Cancel',
        allowDeviceCredential: false,
        androidTitle: 'Unlock Lekka',
        androidSubtitle: 'Authenticate with biometrics',
        androidConfirmationRequired: false,
        androidBiometryStrength: AndroidBiometryStrength.weak
      });
      setPinMood('success');
      setTimeout(() => {
      setIsUnlocked(true);
      setPin('');
        setPinMood('idle');
      }, 320);
      showToast('Biometric unlock successful');
    } catch (error) {
      if (error instanceof BiometryError && error.code === BiometryErrorType.userCancel) return;
      showToast(error instanceof Error ? error.message : 'Biometric unlock failed');
    }
  };

  const verifyBiometricForSettings = async () => {
    if (!Capacitor.isNativePlatform()) {
      showToast('Biometric tests only run inside the Android app');
      return false;
    }

    try {
      const check = await BiometricAuth.checkBiometry();
      if (!check.isAvailable) {
        showToast(check.reason || 'No enrolled biometric is available');
        return false;
      }

      await BiometricAuth.authenticate({
        reason: 'Confirm biometrics for Lekka',
        cancelTitle: 'Cancel',
        allowDeviceCredential: false,
        androidTitle: 'Confirm Lekka biometrics',
        androidSubtitle: 'Use enrolled biometric only',
        androidConfirmationRequired: false,
        androidBiometryStrength: AndroidBiometryStrength.weak
      });

      showToast('Biometric verification worked');
      return true;
    } catch (error) {
      if (error instanceof BiometryError && error.code === BiometryErrorType.userCancel) return false;
      showToast(error instanceof Error ? error.message : 'Biometric verification failed');
      return false;
    }
  };

  const setBiometricPreference = async (enabled: boolean) => {
    if (enabled) {
      const verified = await verifyBiometricForSettings();
      if (!verified) return;
    }

    setBiometricEnabled(enabled);
    localStorage.setItem('lekka_biometric_enabled', String(enabled));
    showToast(enabled ? 'Biometric unlock enabled' : 'Biometric unlock disabled');
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncGmail();
      await refresh();
      logEvent('gmail ingestion ok', `${result.newIngested} synced`);
      showToast(`${result.newIngested} expenses synced, ${result.notificationOnlyCount} emails flagged`, 'Gmail sync', true);
    } catch (error: any) {
      logEvent('gmail ingestion failed', error.message || 'unknown');
      showToast(error.message || 'Gmail sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const saveManual = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.createManualEntry({
        title: manual.title,
        amount: Number(manual.amount),
        paymentMode: manual.paymentMode,
        friendName: manual.paymentMode === 'FRIEND_PAID' ? manual.friendName : '',
        categoryId: manual.categoryId,
        date: manual.date,
        notes: manual.notes
      });
      setManual((prev) => ({ ...prev, title: '', amount: '', friendName: '', notes: '' }));
      setTab('today');
      await refresh();
      showToast('Expense saved', 'Lekka expense', true);
    } catch (error: any) {
      showToast(error.message || 'Could not save expense');
    }
  };

  const reassign = async (entry: EmailRecord, categoryId: string) => {
    try {
      await api.assignCategory(entry._id, categoryId);
      setSelectedEntry(null);
      await refresh();
      showToast('Category updated and rule trained');
    } catch (error: any) {
      showToast(error.message || 'Category update failed');
    }
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload: Record<string, any> = {
        conditions: [{ field: rule.field, operator: rule.operator, value: rule.value }],
        priority: 10
      };
      if (rule.customCategoryName.trim()) payload.customCategoryName = rule.customCategoryName.trim();
      else payload.categoryId = rule.categoryId;
      await api.createRule(payload);
      setRule((prev) => ({ ...prev, value: '', customCategoryName: '' }));
      await refresh();
      showToast('Rule saved');
    } catch (error: any) {
      showToast(error.message || 'Rule save failed');
    }
  };

  const deleteRule = async (id: string) => {
    try {
      await api.deleteRule(id);
      await refresh();
      showToast('Rule deleted');
    } catch (error: any) {
      showToast(error.message || 'Rule delete failed');
    }
  };

  const exportContext = async () => {
    try {
      const bundle = await api.exportContext();
      const payload = {
        exportedAt: new Date().toISOString(),
        backendUrl,
        bundle
      };
      const json = JSON.stringify(payload, null, 2);
      localStorage.setItem('lekka_llm_context_export', json);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lekka_export_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      logEvent('llm export saved', `${json.length} chars`);
      showToast('Export saved locally and downloaded');
    } catch (error: any) {
      logEvent('llm export failed', error.message || 'unknown');
      showToast(error.message || 'Export failed');
    }
  };

  const askAssistant = async (preset?: string) => {
    const message = (preset || chatInput).trim();
    if (!message || chatLoading) return;

    const nextHistory: ChatMessage[] = [...chatMessages, { role: 'user', content: message }];
    setChatMessages(nextHistory);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await api.sendChatMessage({
        message,
        clientState: {
          totalSpend: totals.monthTotal,
          cashSpend: totals.cash,
          friendPaidSpend: totals.friend,
          transactionCount: entries.length,
          pendingReviews: totals.pending,
          categories: categories.filter((category) => category._id !== 'all').map((category) => category.name)
        },
        history: nextHistory.slice(-8)
      });
      setChatMessages((prev) => [...prev, { role: 'assistant', content: response.reply }]);
      logEvent('ai ok', response.toolUsed ? `tool ${response.toolUsed}` : 'direct');
    } catch (error: any) {
      logEvent('ai failed', error.message || 'unknown');
      setChatMessages((prev) => [...prev, { role: 'assistant', content: error.message || 'AI request failed. Check backend URL, API secret, and GROQ_API_KEY.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const updatePin = (event: React.FormEvent) => {
    event.preventDefault();
    if (pinForm.current !== savedPin) return showToast('Current PIN is wrong');
    if (!/^\d{4}$/.test(pinForm.next)) return showToast('New PIN must be 4 digits');
    if (pinForm.next !== pinForm.confirm) return showToast('PIN confirmation does not match');
    localStorage.setItem('lekka_app_pin', pinForm.next);
    setSavedPin(pinForm.next);
    setPinForm({ current: '', next: '', confirm: '' });
    showToast('PIN updated');
  };

  if (!isUnlocked) {
    return (
      <div className="phone-shell">
        <main className={`lock-view ${pinMood}`}>
          <div className="lock-glow" />
          <div className="lock-orbit one" />
          <div className="lock-orbit two" />
          <div className="lock-card">
            <div className="lock-mark"><Lock size={30} /></div>
            <h1>Lekka</h1>
            <p>Private expense ledger</p>
            <div className="lock-mood" aria-live="polite">
              {pinMood === 'success' ? '✅' : pinMood === 'error' ? '❌' : '🔒'}
            </div>
            <div className="pin-dots">{[0, 1, 2, 3].map((dot) => <span key={dot} className={pin.length > dot ? 'filled' : ''} />)}</div>
          </div>
          <div className="keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
              <button key={key} onClick={() => enterPin(key)}>{key}</button>
            ))}
            <button className="bio-key" onClick={biometricUnlock}><Fingerprint size={22} /></button>
            <button onClick={() => enterPin('0')}>0</button>
            <button onClick={() => setPin((prev) => prev.slice(0, -1))}>Del</button>
          </div>
          {toast && <div className="toast compact">{toast}</div>}
        </main>
      </div>
    );
  }

  return (
    <div
      className={`phone-shell ${isEditing ? 'keyboard-editing' : ''}`}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
          setIsEditing(true);
        }
      }}
      onBlurCapture={() => setTimeout(() => setIsEditing(false), 80)}
    >
      <header className="topbar">
        <div>
          <strong>Lekka</strong>
          <span className={`status-dot ${connection}`}>{connection}</span>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>
          <button className="icon-button accent" onClick={() => setTab('ai')} title="Ask AI"><Bot size={19} /></button>
        </div>
      </header>

      {toast && <div className="toast"><span>{toast}</span><button onClick={() => setToast('')}>×</button></div>}

      <main className="content">
        {tab === 'today' && (
          <section className="stack">
            <div className="hero-panel">
              <span>Today</span>
              <strong>{money(periodTotals.today)}</strong>
              <div className="hero-grid">
                <Metric label="Week" value={money(periodTotals.week)} />
                <Metric label="Month" value={money(periodTotals.month)} />
                <Metric label="Pending" value={String(totals.pending)} />
              </div>
            </div>

            <SectionTitle title="Recent ledger" action="View all" onAction={() => setTab('ledger')} />
            <EntryList entries={entries.slice(0, 6)} onSelect={setSelectedEntry} empty="No expenses yet" />
          </section>
        )}

        {tab === 'ai' && (
          <section className="stack">
            <div className="assistant-card ai-screen">
              <div className="section-title">
                <h2>Ask AI</h2>
                {chatLoading && <span className="mini-status">thinking</span>}
              </div>
              <div className="chip-row">
                {['Spend this month?', 'Cash vs online?', 'Pending reviews?'].map((prompt) => (
                  <button className="chip" key={prompt} onClick={() => askAssistant(prompt)}>{prompt}</button>
                ))}
              </div>
              <div className="chat-log tall">
                {chatMessages.length === 0 ? <div className="empty-state small">Ask about your ledger</div> : chatMessages.map((message, index) => (
                  <p key={`${message.role}-${index}`} className={message.role}>{message.content}</p>
                ))}
              </div>
              <div className="assistant-input">
                <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about your ledger" />
                <button onClick={() => askAssistant()} disabled={chatLoading}>Ask</button>
              </div>
            </div>
          </section>
        )}

        {tab === 'ledger' && (
          <section className="stack">
            <div className="search-panel">
              <Search size={18} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, sender, notes" />
            </div>
            <div className="chip-row">
              {categories.map((category) => (
                <button
                  key={category._id}
                  className={categoryFilter === category._id ? 'chip active' : 'chip'}
                  onClick={() => setCategoryFilter(category._id)}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <EntryList entries={filteredEntries} onSelect={setSelectedEntry} empty="No matching expenses" />
          </section>
        )}

        {tab === 'add' && (
          <section className="stack">
            <h2>Add expense</h2>
            <form className="form-card" onSubmit={saveManual}>
              <label>Amount<input inputMode="decimal" value={manual.amount} onChange={(event) => setManual({ ...manual, amount: event.target.value })} placeholder="0" required /></label>
              <label>Merchant or title<input value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} placeholder="Tea, grocery, cab" required /></label>
              <div className="mode-grid">
                {(['CASH', 'UPI', 'CARD', 'FRIEND_PAID'] as PaymentMode[]).map((mode) => (
                  <button type="button" key={mode} className={manual.paymentMode === mode ? 'selected' : ''} onClick={() => setManual({ ...manual, paymentMode: mode })}>{mode.replace('_', ' ')}</button>
                ))}
              </div>
              {manual.paymentMode === 'FRIEND_PAID' && (
                <label>Friend name<input value={manual.friendName} onChange={(event) => setManual({ ...manual, friendName: event.target.value })} placeholder="Who paid?" /></label>
              )}
              <label>Category<select value={manual.categoryId} onChange={(event) => setManual({ ...manual, categoryId: event.target.value })}>{categories.filter((c) => c._id !== 'all').map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>
              <label>Date<input type="date" value={manual.date} onChange={(event) => setManual({ ...manual, date: event.target.value })} /></label>
              <label>Notes<textarea value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} placeholder="Optional" /></label>
              <button className="primary-button" type="submit">Save expense</button>
            </form>
          </section>
        )}

        {tab === 'review' && (
          <section className="stack">
            <SectionTitle title="Review queue" action={`${reviewEntries.length} pending`} />
            <EntryList entries={reviewEntries} onSelect={setSelectedEntry} empty="No pending reviews" />
            <SectionTitle title="Notifications" />
            <NotificationList notifications={notifications} />
          </section>
        )}

        {tab === 'insights' && (
          <section className="stack">
            <div className="stat-grid">
              <Metric label="Today" value={money(periodTotals.today)} />
              <Metric label="Week" value={money(periodTotals.week)} />
              <Metric label="Month total" value={money(totals.monthTotal)} />
              <Metric label="Quarter" value={money(periodTotals.quarter)} />
              <Metric label="Year" value={money(periodTotals.year)} />
              <Metric label="Avg entry" value={money(analytics?.summary.averageAmount || 0)} />
              <Metric label="Auto sorted" value={`${analytics?.summary.aiAccuracyPercentage || 100}%`} />
              <Metric label="Entries" value={String(analytics?.summary.totalEmails || 0)} />
            </div>
            <ReportBars title="Payment modes" rows={(analytics?.paymentModeBreakdown || []).map((item) => ({ label: item.mode, value: item.totalAmount }))} />
            <ReportBars title="Categories" rows={(analytics?.categoryBreakdown || []).map((item) => ({ label: item.categoryName, value: item.totalAmount || item.count, color: item.colorCode }))} />
            <ReportBars title="Daily trend" rows={(analytics?.dailyTrend || []).map((item) => ({ label: item.date.slice(8), value: item.totalAmount }))} />
          </section>
        )}

        {tab === 'rules' && (
          <section className="stack">
            <h2>Rules</h2>
            <form className="form-card" onSubmit={saveRule}>
              <div className="two-col">
                <label>Field<select value={rule.field} onChange={(event) => setRule({ ...rule, field: event.target.value })}><option value="sender">Sender</option><option value="subject">Subject</option><option value="body">Body</option></select></label>
                <label>Match<select value={rule.operator} onChange={(event) => setRule({ ...rule, operator: event.target.value })}><option value="contains">Contains</option><option value="equals">Equals</option><option value="startsWith">Starts with</option><option value="regex">Regex</option></select></label>
              </div>
              <label>Value<input value={rule.value} onChange={(event) => setRule({ ...rule, value: event.target.value })} placeholder="Swiggy, Amazon, rent" required /></label>
              <label>Category<select value={rule.categoryId} onChange={(event) => setRule({ ...rule, categoryId: event.target.value })}>{categories.filter((c) => c._id !== 'all').map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>
              <label>New category<input value={rule.customCategoryName} onChange={(event) => setRule({ ...rule, customCategoryName: event.target.value })} placeholder="Optional" /></label>
              <button className="primary-button" type="submit">Save rule</button>
            </form>
            <div className="list">
              {rules.map((item) => (
                <article className="rule-row" key={item._id}>
                  <div><strong>{item.categoryId?.name || 'Category'}</strong><span>{item.conditions.map((condition) => `${condition.field} ${condition.operator} ${condition.value}`).join(' and ')}</span></div>
                  <button className="icon-button danger" onClick={() => deleteRule(item._id)}><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="stack">
            <h2>Settings</h2>
            <div className="form-card">
              <div className="settings-row">
                <span>Backend</span>
                <strong className={connection}>{connection}</strong>
              </div>
              <div className="settings-row">
                <span>Notification channel</span>
                <strong>Sync alerts</strong>
              </div>
              <label className="toggle"><span>Biometric unlock</span><input type="checkbox" checked={biometricEnabled} onChange={(event) => setBiometricPreference(event.target.checked)} /></label>
              <button className="secondary-button" onClick={exportContext}>Export LLM context</button>
            </div>
            <section className="form-card collapsible">
              <button className="collapse-head" type="button" onClick={sync}>
                <span>{syncing ? 'Ingesting Gmail...' : 'Manual Gmail ingestion'}</span>
                <RefreshCw size={18} className={syncing ? 'spin' : ''} />
              </button>
            </section>
            <section className="form-card collapsible">
              <button className="collapse-head" type="button" onClick={() => setSecurityOpen((open) => !open)}>
                <span>Security PIN</span>
                <ChevronRight size={18} className={securityOpen ? 'open' : ''} />
              </button>
              {securityOpen && (
                <form className="pin-form" onSubmit={updatePin}>
                  <label>Current PIN<input inputMode="numeric" value={pinForm.current} onChange={(event) => setPinForm({ ...pinForm, current: event.target.value })} maxLength={4} /></label>
                  <label>New PIN<input inputMode="numeric" value={pinForm.next} onChange={(event) => setPinForm({ ...pinForm, next: event.target.value })} maxLength={4} /></label>
                  <label>Confirm PIN<input inputMode="numeric" value={pinForm.confirm} onChange={(event) => setPinForm({ ...pinForm, confirm: event.target.value })} maxLength={4} /></label>
                  <button className="primary-button" type="submit">Update PIN</button>
                </form>
              )}
            </section>
            <section className="form-card collapsible">
              <button className="collapse-head" type="button">
                <span>APK logs</span>
                <small>{debugLogs.length}</small>
              </button>
              <div className="log-box">
                {debugLogs.length === 0 ? <span>No logs yet</span> : debugLogs.slice(0, 20).map((line) => <code key={line}>{line}</code>)}
              </div>
              <div className="two-col pad-inline">
                <button className="secondary-button" onClick={() => navigator.clipboard?.writeText(debugLogs.join('\n')).then(() => showToast('Logs copied')).catch(() => showToast('Copy failed'))}>Copy logs</button>
                <button className="secondary-button" onClick={() => { localStorage.removeItem('lekka_debug_logs'); setDebugLogs([]); showToast('Logs cleared'); }}>Clear</button>
              </div>
            </section>
          </section>
        )}
      </main>

      {selectedEntry && (
        <EntrySheet
          entry={selectedEntry}
          categories={categories.filter((category) => category._id !== 'all')}
          onClose={() => setSelectedEntry(null)}
          onReassign={(categoryId) => reassign(selectedEntry, categoryId)}
        />
      )}

      <nav className="bottom-nav">
        <NavButton active={tab === 'today'} icon={<Wallet size={20} />} label="Today" onClick={() => setTab('today')} />
        <NavButton active={tab === 'ledger'} icon={<ListFilter size={20} />} label="Ledger" onClick={() => setTab('ledger')} />
        <NavButton active={tab === 'add'} icon={<Plus size={22} />} label="Add" onClick={() => setTab('add')} />
        <NavButton active={tab === 'review'} icon={<Bell size={20} />} label="Review" onClick={() => setTab('review')} />
        <NavButton active={tab === 'insights'} icon={<BarChart3 size={20} />} label="Stats" onClick={() => setTab('insights')} />
        <NavButton active={tab === 'rules'} icon={<SlidersHorizontal size={20} />} label="Rules" onClick={() => setTab('rules')} />
        <NavButton active={tab === 'settings'} icon={<Settings size={20} />} label="Set" onClick={() => setTab('settings')} />
      </nav>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="section-title"><h2>{title}</h2>{action && <button onClick={onAction}>{action}<ChevronRight size={16} /></button>}</div>;
}

function EntryList({ entries, onSelect, empty }: { entries: EmailRecord[]; onSelect: (entry: EmailRecord) => void; empty: string }) {
  if (entries.length === 0) return <div className="empty-state">{empty}</div>;
  return (
    <div className="list">
      {entries.map((entry) => (
        <article className="entry-row" key={entry._id} onClick={() => onSelect(entry)}>
          <div className="entry-main">
            <strong>{entry.parsedJson?.merchantName || entry.subject}</strong>
            <span>{entry.sender} · {shortDate(entry.receivedAt)}</span>
            <small>{entry.categoryId?.name || 'Unassigned'} · {entry.parsedJson?.paymentMode || entry.categorySource}</small>
          </div>
          <div className="entry-side">
            <strong>{moneyExact(amountOf(entry))}</strong>
            {entry.needsUserReview && <span className="pill warning">Review</span>}
          </div>
        </article>
      ))}
    </div>
  );
}

function NotificationList({ notifications }: { notifications: NotificationItem[] }) {
  if (notifications.length === 0) return <div className="empty-state">No notifications</div>;
  return (
    <div className="list">
      {notifications.map((item) => (
        <article className="note-row" key={item.id}>
          <Bell size={16} />
          <div><strong>{item.title}</strong><span>{item.message}</span></div>
          <small>{timeAgo(item.createdAt)}</small>
        </article>
      ))}
    </div>
  );
}

function ReportBars({ title, rows }: { title: string; rows: Array<{ label: string; value: number; color?: string }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="report-card">
      <h2>{title}</h2>
      {rows.length === 0 ? <div className="empty-state small">No data yet</div> : rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <div><span>{row.label}</span><strong>{money(row.value)}</strong></div>
          <i><b style={{ width: `${Math.max(4, (row.value / max) * 100)}%`, background: row.color || '#0f766e' }} /></i>
        </div>
      ))}
    </section>
  );
}

function EntrySheet({ entry, categories, onClose, onReassign }: { entry: EmailRecord; categories: Category[]; onClose: () => void; onReassign: (categoryId: string) => void }) {
  const [categoryId, setCategoryId] = useState(entry.categoryId?._id || categories[0]?._id || '');
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="entry-detail-head">
          <div><span>Amount</span><strong>{moneyExact(amountOf(entry))}</strong></div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <h2>{entry.parsedJson?.merchantName || entry.subject}</h2>
        <p>{entry.rawTextBody || 'No receipt text stored.'}</p>
        <div className="detail-grid">
          <Metric label="Sender" value={entry.sender} />
          <Metric label="Date" value={shortDate(entry.receivedAt)} />
          <Metric label="Mode" value={entry.parsedJson?.paymentMode || entry.categorySource} />
          <Metric label="Source" value={entry.categorySource} />
        </div>
        <label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>
        <button className="primary-button" onClick={() => onReassign(categoryId)}><Tag size={18} /> Save category</button>
      </section>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>;
}
