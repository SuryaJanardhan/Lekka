import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  BarChart3,
  ArrowUp,
  History,
  Bell,
  Bot,
  ChevronRight,
  Check,
  ListFilter,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Tag,
  Trash2,
  Wallet,
  X
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
import { LockScreen } from './LockScreen';
import { ChatMessage, Conversation, loadConversations, saveConversations, newConversationId } from './chatHistory';
import { startRemotePush, stopRemotePush } from './remotePush';
import { CategorySettings } from './CategorySettings';
import { CategoryPicker } from './CategoryPicker';

type Tab = 'today' | 'ledger' | 'add' | 'review' | 'insights' | 'rules' | 'settings' | 'ai';
type PaymentMode = 'CASH' | 'FRIEND_PAID' | 'UPI' | 'CARD';

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

function requiresReview(entry: EmailRecord) {
  return entry.needsUserReview || !entry.categoryId || entry.categorySource === 'UNASSIGNED';
}

export function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinMood, setPinMood] = useState<'idle' | 'success' | 'error'>('idle');
  const [savedPin, setSavedPin] = useState(() => localStorage.getItem('lekka_app_pin') || '1234');
  const [biometricEnabled, setBiometricEnabled] = useState(() => localStorage.getItem('lekka_biometric_enabled') === 'true');
  const [remotePushEnabled, setRemotePushEnabled] = useState(() => localStorage.getItem('lekka_remote_push_enabled') !== 'false');
  const [remotePushStatus, setRemotePushStatus] = useState('Not connected');
  const [tab, setTab] = useState<Tab>('today');
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking');
  const [toast, setToastValue] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const setToast = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToastValue(message);
    if (message) toastTimer.current = setTimeout(() => setToastValue(''), 3000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  const [entries, setEntries] = useState<EmailRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([defaultCategory]);
  const [analytics, setAnalytics] = useState<DashboardStats | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [clearingNotifications, setClearingNotifications] = useState(false);
  const [notificationExit, setNotificationExit] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<EmailRecord | null>(null);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [chatInput, setChatInput] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [conversationId, setConversationId] = useState(() => conversations[0]?.id || newConversationId());
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const chatMessages = conversations.find((item) => item.id === conversationId)?.messages || [];
  const chatLog = useRef<HTMLDivElement>(null);
  const chatComposer = useRef<HTMLTextAreaElement>(null);
  const [viewportHeight, setViewportHeight] = useState(() => window.visualViewport?.height || window.innerHeight);
  const [chatLoading, setChatLoading] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => setViewportHeight(viewport?.height || window.innerHeight);
    viewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      window.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => {
    try { saveConversations(conversations); }
    catch { setToast('Chat history could not be saved. Device storage may be full.'); }
  }, [conversations, setToast]);
  useEffect(() => {
    if (chatLog.current) chatLog.current.scrollTop = chatLog.current.scrollHeight;
  }, [conversations, chatLoading, viewportHeight, tab]);
  useEffect(() => {
    if (!chatComposer.current) return;
    chatComposer.current.style.height = 'auto';
    chatComposer.current.style.height = `${Math.min(chatComposer.current.scrollHeight, 120)}px`;
  }, [chatInput, tab]);
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
      setConnection('online');
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

  useEffect(() => {
    if (!isUnlocked || !remotePushEnabled) return;
    return startRemotePush(api, {
      status: setRemotePushStatus,
      received: (title) => { logEvent('remote notification received', title); refresh(); },
      opened: (screen) => {
        setTab(screen === 'insights' ? 'insights' : screen === 'ledger' ? 'ledger' : screen === 'settings' ? 'settings' : 'review');
        refresh();
      },
      error: (detail) => logEvent('remote push', detail)
    });
  }, [isUnlocked, remotePushEnabled]);

  const setRemotePushPreference = async (enabled: boolean) => {
    try {
      if (!enabled) await stopRemotePush(api);
      localStorage.setItem('lekka_remote_push_enabled', String(enabled));
      setRemotePushEnabled(enabled);
      setRemotePushStatus(enabled ? 'Connecting' : 'Disabled');
    } catch (error: any) { setToast(error.message || 'Could not update notifications'); }
  };

  const totals = useMemo(() => {
    const monthTotal = analytics?.summary.totalFinancialAmount || 0;
    const cash = analytics?.paymentModeBreakdown?.find((item) => item.mode === 'CASH')?.totalAmount || 0;
    const friend = analytics?.paymentModeBreakdown?.find((item) => item.mode === 'FRIEND_PAID')?.totalAmount || 0;
    const pending = entries.filter(requiresReview).length;
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

  const reviewEntries = entries.filter(requiresReview);

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

  const createCategory = async (name: string) => {
    const category = await api.createCategory(name);
    setCategories((previous) => [...previous.filter((item) => item._id !== category._id), category].sort((a, b) => a.name.localeCompare(b.name)));
    return category;
  };

  const updateEntry = async (entry: EmailRecord, payload: Record<string, any>) => {
    try {
      await api.updateEntry(entry._id, payload);
      setSelectedEntry(null);
      await refresh();
      showToast('Transaction updated');
    } catch (error: any) {
      showToast(error.message || 'Transaction update failed');
    }
  };

  const deleteEntry = async (entry: EmailRecord) => {
    try {
      await api.deleteEntry(entry._id);
      setSelectedEntry(null);
      await refresh();
      showToast('Transaction deleted');
    } catch (error: any) {
      showToast(error.message || 'Transaction delete failed');
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

  const markNotificationReviewed = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((previous) => previous.map((item) => item.id === id ? { ...item, read: true } : item));
      showToast('Marked reviewed');
    } catch (error: any) {
      showToast(error.message || 'Could not mark reviewed');
    }
  };

  const clearNotifications = async () => {
    if (clearingNotifications) return;
    setClearingNotifications(true);
    try {
      await api.clearNotifications();
      setNotificationExit(true);
      await new Promise((resolve) => setTimeout(resolve, 220));
      setNotifications([]);
    } catch (error: any) {
      showToast(error.message || 'Could not clear notifications');
    } finally {
      setNotificationExit(false);
      setClearingNotifications(false);
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
    const requestConversationId = conversationId;
    setConversations((previous) => {
      const existing = previous.find((item) => item.id === requestConversationId);
      return [{ id: requestConversationId, title: existing?.title || message.slice(0, 60), messages: nextHistory, updatedAt: new Date().toISOString() }, ...previous.filter((item) => item.id !== requestConversationId)];
    });
    setChatInput('');
    setChatLoading(true);
    const appendReply = (content: string) => setConversations((previous) => previous.map((item) =>
      item.id === requestConversationId ? { ...item, messages: [...item.messages, { role: 'assistant', content }], updatedAt: new Date().toISOString() } : item
    ));

    try {
      const response = await api.sendChatMessage({
        sessionId: requestConversationId,
        message,
        clientState: {
          backendUrl: api.getBaseUrl(),
          totals: {
            today: periodTotals.today,
            week: periodTotals.week,
            month: periodTotals.month,
            quarter: periodTotals.quarter,
            year: periodTotals.year,
            cash: totals.cash,
            friendPaid: totals.friend,
            online: totals.online,
            pendingReviews: totals.pending,
            transactionCount: entries.length
          },
          analytics,
          categories: categories.filter((category) => category._id !== 'all'),
          recentEntries: entries.slice(0, 25).map((entry) => ({
            id: entry._id,
            title: entry.parsedJson?.merchantName || entry.subject,
            sender: entry.sender,
            amount: amountOf(entry),
            category: entry.categoryId?.name || 'Unassigned',
            paymentMode: entry.parsedJson?.paymentMode || entry.categorySource,
            date: entry.receivedAt,
            needsReview: entry.needsUserReview
          })),
          reviewEntries: reviewEntries.slice(0, 20).map((entry) => ({
            id: entry._id,
            title: entry.parsedJson?.merchantName || entry.subject,
            amount: amountOf(entry),
            sender: entry.sender,
            date: entry.receivedAt
          })),
          rules: rules.slice(0, 30),
          notifications: notifications.slice(0, 20),
          responseStyle: 'Use short plain text. Do not use markdown markers like **. Use simple lines when useful.'
        },
        history: nextHistory.slice(-8)
      });
      appendReply(response.reply);
      logEvent('ai ok', response.toolUsed ? `tool ${response.toolUsed}` : 'direct');
    } catch (error: any) {
      logEvent('ai failed', error.message || 'unknown');
      appendReply(error.message || 'AI request failed. Please try again.');
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
      <LockScreen
        pin={pin}
        mood={pinMood}
        toast={toast}
        onDigit={enterPin}
        onDelete={() => setPin((prev) => prev.slice(0, -1))}
        onBiometric={biometricUnlock}
      />
    );
  }

  return (
    <div
      className={`phone-shell ${isEditing ? 'keyboard-editing' : ''} ${tab === 'ai' ? 'chat-screen-shell' : ''}`}
      style={{ height: `${Math.min(viewportHeight, 920)}px` }}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
          setIsEditing(true);
        }
      }}
      onBlurCapture={() => setTimeout(() => {
        const active = document.activeElement;
        setIsEditing(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement);
      }, 80)}
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

      <main className={`content ${tab === 'ai' ? 'chat-content' : ''}`}>
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
          <section className="ai-conversation">
              <div className="section-title">
                <h2>Ask AI</h2>
                <div className="top-actions">
                  <button className="icon-button" title="Chat history" aria-label="Chat history" aria-expanded={chatHistoryOpen} onClick={() => setChatHistoryOpen((open) => !open)}><History size={18} /></button>
                  <button className="icon-button" title="New chat" aria-label="New chat" disabled={chatLoading} onClick={() => { setConversationId(newConversationId()); setChatInput(''); setChatHistoryOpen(false); }}><Plus size={18} /></button>
                </div>
              </div>
              {chatHistoryOpen && <div className="conversation-history">
                {conversations.length === 0 && <p>No saved chats yet</p>}
                {conversations.map((item) => <div key={item.id}>
                  <button disabled={chatLoading} className={item.id === conversationId ? 'selected' : ''} onClick={() => { setConversationId(item.id); setChatInput(''); setChatHistoryOpen(false); }}><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleDateString()}</small></button>
                  <button disabled={chatLoading} className="icon-button danger" title="Delete conversation" aria-label={`Delete ${item.title}`} onClick={() => { if (!window.confirm('Delete this conversation?')) return; setConversations((previous) => previous.filter((chat) => chat.id !== item.id)); if (item.id === conversationId) setConversationId(newConversationId()); }}><Trash2 size={16} /></button>
                </div>)}
              </div>}
              {chatMessages.length === 0 && <div className="chip-row">
                {['Spend this month?', 'Cash vs online?', 'Pending reviews?'].map((prompt) => (
                  <button className="chip" key={prompt} onClick={() => askAssistant(prompt)}>{prompt}</button>
                ))}
              </div>}
              <div className="chat-log conversation-messages" ref={chatLog}>
                {chatMessages.length === 0 ? <div className="empty-state small">Ask about your ledger</div> : chatMessages.map((message, index) => (
                  <AssistantMessage key={`${message.role}-${index}`} message={message} />
                ))}
                {chatLoading && <TypingDots />}
              </div>
              <form className="assistant-input conversation-composer" onSubmit={(event) => { event.preventDefault(); askAssistant(); }}>
                <textarea ref={chatComposer} rows={1} aria-label="Message AI" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about your ledger" />
                <button type="submit" aria-label="Send message" title="Send message" disabled={chatLoading || !chatInput.trim()}><ArrowUp size={20} /></button>
              </form>
          </section>
        )}

        {tab === 'ledger' && (
          <section className="stack">
            <div className="search-panel">
              <Search size={18} />
              <input ref={searchInput} aria-label="Search ledger" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, sender, notes" />
              {search && <button className="icon-button search-clear" type="button" title="Clear search" aria-label="Clear search" onClick={() => { setSearch(''); searchInput.current?.focus(); }}><X size={17} /></button>}
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
            <div className="section-title">
              <h2>Notifications</h2>
              <button className="icon-button" type="button" title="Clear all notifications" aria-label="Clear all notifications" disabled={clearingNotifications || notifications.length === 0} onClick={clearNotifications}><X size={18} /></button>
            </div>
            <div className={`notification-list${notificationExit ? ' notification-list-exit' : ''}`}>
              <NotificationList notifications={notifications} onRead={markNotificationReviewed} />
            </div>
          </section>
        )}

        {tab === 'insights' && (
          <section className="stack">
            <div className="stat-grid">
              <Metric label="Today" value={money(periodTotals.today)} />
              <Metric label="Week" value={money(periodTotals.week)} />
              <Metric label="Month total" value={money(totals.monthTotal)} />
              <Metric label="Quarter" value={money(periodTotals.quarter)} />
              <Metric label={`Year ${new Date().getFullYear()}`} value={money(periodTotals.year)} />
              <Metric label="Avg entry" value={money(analytics?.summary.averageAmount || 0)} />
              <Metric label="Auto sorted" value={`${analytics?.summary.aiAccuracyPercentage || 100}%`} />
              <Metric label="Entries" value={String(analytics?.summary.totalEmails || 0)} />
            </div>
            <VisualSummary
              total={analytics?.summary.totalFinancialAmount || 0}
              categories={(analytics?.categoryBreakdown || []).map((item) => ({ label: item.categoryName, value: item.totalAmount || item.count, color: item.colorCode }))}
              modes={(analytics?.paymentModeBreakdown || []).map((item, index) => ({ label: item.mode, value: item.totalAmount, color: ['#0f766e', '#2563eb', '#b45309', '#dc2626'][index % 4] }))}
            />
            <ReportBars title="Daily trend" rows={(analytics?.dailyTrend || []).map((item, index) => ({ label: item.date.slice(8), value: item.totalAmount, color: ['#14b8a6', '#2563eb', '#f59e0b', '#ef4444'][index % 4] }))} />
            <ReportBars title="Monthly trend" rows={(analytics?.monthlyTrend || []).map((item, index) => ({ label: new Date(Number(item.month.slice(0, 4)), Number(item.month.slice(5, 7)) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), value: item.totalAmount, color: ['#0f766e', '#2563eb', '#b45309', '#dc2626'][index % 4] }))} />
            <ReportBars title="Yearly trend" rows={(analytics?.yearlyTrend || []).map((item, index) => ({ label: item.year, value: item.totalAmount, color: ['#2563eb', '#0f766e', '#b45309', '#dc2626'][index % 4] }))} />
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
            <CategorySettings categories={categories.filter((category) => category._id !== 'all')} onCreate={createCategory} onRename={async (id, name) => {
              await api.renameCategory(id, name);
              await refresh();
              showToast('Category renamed');
            }} />
            <div className="form-card">
              <div className="settings-row">
                <span>Backend</span>
                <strong className={connection}>{connection}</strong>
              </div>
              <div className="settings-row">
                <span>Remote notifications</span>
                <strong>{remotePushEnabled ? remotePushStatus : 'Disabled'}</strong>
              </div>
              <label className="toggle"><span>Spending summaries & review alerts</span><input type="checkbox" checked={remotePushEnabled} onChange={(event) => setRemotePushPreference(event.target.checked)} /></label>
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
          onCreateCategory={createCategory}
          onUpdate={(payload) => updateEntry(selectedEntry, payload)}
          onDelete={() => deleteEntry(selectedEntry)}
        />
      )}

      <nav className="bottom-nav">
        <NavButton active={tab === 'today'} icon={<Wallet size={20} />} label="Today" onClick={() => setTab('today')} />
        <NavButton active={tab === 'ledger'} icon={<ListFilter size={20} />} label="Ledger" onClick={() => setTab('ledger')} />
        <NavButton active={tab === 'add'} icon={<Plus size={22} />} label="Add" onClick={() => setTab('add')} />
        <NavButton active={tab === 'review'} icon={<Bell size={20} />} label="Review" badge={reviewEntries.length > 0 || notifications.some((item) => item.type === 'REVIEW' && !item.read)} onClick={() => setTab('review')} />
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

function AssistantMessage({ message }: { message: ChatMessage }) {
  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  return (
    <div className={`chat-message ${message.role}`}>
      {message.content
        .replace(/\*\*/g, '**')
        .split('\n')
        .map((line, index) => {
          const clean = line.trim().replace(/^[-*]\s+/, '');
          if (!clean) return null;
          return <p key={`${message.role}-line-${index}`}>{renderInline(clean)}</p>;
        })}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="chat-message assistant typing" aria-label="AI is thinking">
      <i />
      <i />
      <i />
    </div>
  );
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
            <small>{entry.categoryId?.name || 'Unassigned'} · {entry.parsedJson?.paymentMode || 'Mode not set'}</small>
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

function NotificationList({ notifications, onRead }: { notifications: NotificationItem[]; onRead: (id: string) => void }) {
  if (notifications.length === 0) return <div className="empty-state">No notifications</div>;
  return (
    <div className="list">
      {notifications.map((item) => (
        <article className="note-row" key={item.id}>
          <Bell size={16} />
          <div><strong>{item.title}</strong><span>{item.message}</span></div>
          <div className="note-actions">
            <small>{timeAgo(item.createdAt)}</small>
            {item.type === 'REVIEW' && !item.read && <button className="icon-button" type="button" title="Mark reviewed" aria-label={`Mark reviewed: ${item.title}`} onClick={() => onRead(item.id)}><Check size={17} /></button>}
          </div>
        </article>
      ))}
    </div>
  );
}

function VisualSummary({
  total,
  categories,
  modes
}: {
  total: number;
  categories: Array<{ label: string; value: number; color?: string }>;
  modes: Array<{ label: string; value: number; color?: string }>;
}) {
  const slices = categories.length ? categories.slice(0, 5) : [{ label: 'No data', value: 1, color: '#cbd5e1' }];
  const sum = Math.max(1, slices.reduce((value, row) => value + row.value, 0));
  let cursor = 0;

  return (
    <section className="chart-card">
      <div>
        <h2>Spend map</h2>
        <span>{money(total)} this month</span>
      </div>
      <div className="chart-grid">
        <svg className="donut" viewBox="0 0 42 42" aria-label="Category spend chart">
          <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#e5e7eb" strokeWidth="7" />
          {slices.map((slice) => {
            const size = (slice.value / sum) * 100;
            const dash = `${size} ${100 - size}`;
            const offset = 25 - cursor;
            cursor += size;
            return <circle key={slice.label} cx="21" cy="21" r="15.9" fill="transparent" stroke={slice.color || '#0f766e'} strokeWidth="7" strokeDasharray={dash} strokeDashoffset={offset} />;
          })}
          <text x="21" y="20" textAnchor="middle">{categories.length}</text>
          <text x="21" y="25" textAnchor="middle">cats</text>
        </svg>
        <div className="legend-list">
          {categories.slice(0, 5).map((row) => (
            <span key={row.label}><i style={{ background: row.color || '#0f766e' }} />{row.label}<b>{money(row.value)}</b></span>
          ))}
          {categories.length === 0 && <span><i />No category spend yet<b>{money(0)}</b></span>}
        </div>
      </div>
      <div className="mode-chart">
        {modes.length === 0 ? <div className="empty-state small">No payment mode data yet</div> : modes.map((mode) => (
          <div key={mode.label}>
            <strong>{mode.label.replace('_', ' ')}</strong>
            <span>{money(mode.value)}</span>
            <i><b style={{ height: `${Math.max(8, (mode.value / Math.max(...modes.map((item) => item.value), 1)) * 100)}%`, background: mode.color || '#0f766e' }} /></i>
          </div>
        ))}
      </div>
    </section>
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

function EntrySheet({
  entry,
  categories,
  onClose,
  onReassign,
  onCreateCategory,
  onUpdate,
  onDelete
}: {
  entry: EmailRecord;
  categories: Category[];
  onClose: () => void;
  onReassign: (categoryId: string) => void;
  onCreateCategory: (name: string) => Promise<Category>;
  onUpdate: (payload: Record<string, any>) => void;
  onDelete: () => void;
}) {
  const [categoryId, setCategoryId] = useState(entry.categoryId?._id || '');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: entry.parsedJson?.merchantName || entry.subject,
    amount: String(amountOf(entry) || ''),
    paymentMode: (entry.parsedJson?.paymentMode || 'CASH') as PaymentMode,
    friendName: entry.parsedJson?.friendName || '',
    date: new Date(entry.receivedAt).toISOString().slice(0, 10),
    notes: entry.parsedJson?.notes || entry.rawTextBody || ''
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onUpdate({ ...form, amount: Number(form.amount), categoryId });
  };

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
        {!editing ? (
          <>
            <div className="detail-grid">
              <Metric label="Sender" value={entry.sender} />
              <Metric label="Date" value={shortDate(entry.receivedAt)} />
              <Metric label="Mode" value={entry.parsedJson?.paymentMode || entry.categorySource} />
              <Metric label="Source" value={entry.categorySource} />
            </div>
            <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} onCreate={onCreateCategory} />
            <button className="primary-button" disabled={!categoryId} onClick={() => onReassign(categoryId)}><Tag size={18} /> Save category</button>
            <div className="two-col">
              <button className="secondary-button" onClick={() => setEditing(true)}>Edit</button>
              <button className="secondary-button danger-text" onClick={onDelete}><Trash2 size={17} /> Delete</button>
            </div>
          </>
        ) : (
          <form className="pin-form sheet-form" onSubmit={submit}>
            <label>Amount<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
            <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
            <label>Mode<select value={form.paymentMode} onChange={(event) => setForm({ ...form, paymentMode: event.target.value as PaymentMode })}>{(['CASH', 'UPI', 'CARD', 'FRIEND_PAID'] as PaymentMode[]).map((mode) => <option key={mode} value={mode}>{mode.replace('_', ' ')}</option>)}</select></label>
            {form.paymentMode === 'FRIEND_PAID' && <label>Friend name<input value={form.friendName} onChange={(event) => setForm({ ...form, friendName: event.target.value })} /></label>}
            <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} onCreate={onCreateCategory} />
            <label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label>Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <button className="primary-button" type="submit" disabled={!categoryId}>Save changes</button>
            <button className="secondary-button" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        )}
      </section>
    </div>
  );
}

function NavButton({ active, icon, label, onClick, badge }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void; badge?: boolean }) {
  return <button className={active ? 'active' : ''} onClick={onClick} aria-label={label}><span className="nav-icon">{icon}{badge && <i className="review-dot" aria-label="Pending review actions" />}</span><span>{label}</span></button>;
}
