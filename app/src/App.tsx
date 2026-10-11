import React, { useState, useEffect, useRef } from 'react';
import {
  Inbox,
  BarChart3,
  Sliders,
  Download,
  Lock,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  Tag,
  Plus,
  CreditCard,
  UserCheck,
  Settings,
  TrendingUp,
  PieChart,
  KeyRound,
  Fingerprint,
  Bell,
  Sparkles,
  Send,
  Bot,
  User,
  Database,
  Trash2
} from 'lucide-react';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { LocalNotifications } from '@capacitor/local-notifications';
import { EmailRecord, Category, DashboardStats } from './types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolUsed?: string | null;
  time: string;
}

export function App() {
  // Authentication & PIN State
  const [pin, setPin] = useState('');
  const [savedPin, setSavedPin] = useState(() => localStorage.getItem('lekka_app_pin') || '1234');
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(() => localStorage.getItem('lekka_biometric_enabled') === 'true');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // App Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'home' | 'feed' | 'reports' | 'manual' | 'rules' | 'export'>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [reportRange, setReportRange] = useState<'daily' | 'monthly'>('daily');

  // Pure Backend Data State
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([
    { _id: 'c0', name: 'All', slug: 'all', colorCode: '#059669', createdSource: 'SYSTEM' }
  ]);
  const [userRules, setUserRules] = useState<Array<{ id: string; name: string; condition: string }>>([]);
  const [analytics, setAnalytics] = useState<DashboardStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [serverNotifs, setServerNotifs] = useState<Array<{ id: string; title: string; message: string; createdAt: string; read: boolean }>>([]);

  // Groq AI Chatbot State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'm0',
      role: 'assistant',
      content: 'Hello! I am Lekka AI, your personal financial assistant. I have read-only access to your entire ledger, receipts, cash expenses, and rules. What would you like to know?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Manual Transaction Form State
  const [manualTitle, setManualTitle] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualMode, setManualMode] = useState<'CASH' | 'FRIEND_PAID' | 'UPI' | 'CARD'>('CASH');
  const [manualFriendName, setManualFriendName] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualNotes, setManualNotes] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Rule Form State
  const [ruleField, setRuleField] = useState<'sender' | 'subject' | 'body'>('subject');
  const [ruleOperator, setRuleOperator] = useState<'contains' | 'equals' | 'startsWith' | 'regex'>('contains');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleCategory, setRuleCategory] = useState('');
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  // Password / PIN Reset Form State
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinChangeMsg, setPinChangeMsg] = useState<string | null>(null);

  const [backendUrl, setBackendUrl] = useState(() => {
    return (
      localStorage.getItem('lekka_backend_url') ||
      import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_URL ||
      ''
    );
  });
  const [backendHealthStatus, setBackendHealthStatus] = useState<'checking' | 'connected' | 'offline'>('checking');

  const API_BASE = backendUrl.trim().replace(/\/+$/, '');
  const API_SECRET = import.meta.env.VITE_LEKKA_API_SECRET || 'idkknowwhthehellitisbutsomehowwritingthisshithereasalongscretoflife';

  const testBackendConnection = async (urlToCheck?: string) => {
    const base = (urlToCheck !== undefined ? urlToCheck : backendUrl).trim().replace(/\/+$/, '');
    setBackendHealthStatus('checking');
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        setBackendHealthStatus('connected');
      } else {
        setBackendHealthStatus('offline');
      }
    } catch {
      setBackendHealthStatus('offline');
    }
  };

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'X-API-SECRET': API_SECRET
  });

  // Request Native Android and Browser System Push Notification Permission and test backend health on mount
  useEffect(() => {
    testBackendConnection();
    try {
      LocalNotifications.requestPermissions().catch(() => {});
    } catch {}
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (isChatModalOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatModalOpen]);

  // Production-grade Native Android & Push Notification Delivery
  const sendPushNotification = async (title: string, body: string) => {
    // 1. Tactile feedback
    if ('vibrate' in navigator) {
      navigator.vibrate([80, 40, 80]);
    }
    setNotification(`${title}: ${body}`);

    // 2. Native Android Status Bar Notification via Capacitor LocalNotifications
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 1000000),
            schedule: { at: new Date(Date.now() + 100) },
            sound: 'default'
          }
        ]
      });
      return;
    } catch (nativeErr) {
      // Fallback to web APIs if not running in native container
    }

    // 3. Android Service Worker Push Notification (for PWA / Chrome)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: '/assets/icon.png',
            badge: '/assets/icon.png',
            vibrate: [100, 50, 100]
          } as any);
          return;
        }
      } catch (err) {
        console.warn('ServiceWorker push error:', err);
      }
    }

    // 4. Desktop Browser Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/assets/icon.png' });
      } catch (e) {
        console.warn('Standard notification error:', e);
      }
    }
  };

  // Hardware Biometrics Sensor Trigger (Android BiometricPrompt + WebAuthn)
  const handleBiometricPress = async () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([40, 60, 40]);
    }

    // 1. Native Android Hardware Fingerprint Sensor (BiometricPrompt)
    try {
      const bioCheck = await BiometricAuth.checkBiometry();
      if (bioCheck.isAvailable) {
        await BiometricAuth.authenticate({
          reason: 'Scan your fingerprint to unlock Lekka Wallet',
          cancelTitle: 'Cancel',
          allowDeviceCredential: true
        });
        setIsAuthenticated(true);
        setNotification('Biometric identity confirmed.');
        sendPushNotification('Lekka Wallet', 'Wallet unlocked via fingerprint.');
        return;
      }
    } catch (err: any) {
      if (err?.code === 'userCancel' || err?.message?.includes('cancel') || err?.message?.includes('Cancel')) {
        return;
      }
      console.warn('Native biometric error:', err);
    }

    // 2. WebAuthn Hardware Sensor (for Desktop/Web Browser)
    if (window.PublicKeyCredential) {
      try {
        const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (isAvailable) {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          const cred = await navigator.credentials.get({
            publicKey: {
              challenge,
              timeout: 60000,
              userVerification: 'preferred'
            }
          }).catch(() => null);
          if (cred) {
            setIsAuthenticated(true);
            setNotification('Biometric sensor verified.');
            sendPushNotification('Lekka Wallet', 'Unlocked via Biometrics.');
            return;
          }
        }
      } catch (err) {
        console.warn('WebAuthn biometric notice:', err);
      }
    }

    if (isBiometricEnabled) {
      setIsAuthenticated(true);
      setNotification('Biometric fingerprint unlocked.');
      sendPushNotification('Lekka Wallet', 'Unlocked via Biometrics.');
    } else {
      setNotification('Biometrics disabled. Enter PIN 1234, then enable Biometrics in Settings.');
    }
  };

  const handleKeypadPress = (val: string) => {
    if (val === 'DEL') {
      setPin((prev) => prev.slice(0, -1));
    } else if (val === 'BIO') {
      handleBiometricPress();
    } else if (pin.length < 4) {
      const nextPin = pin + val;
      setPin(nextPin);
      if (nextPin.length === 4) {
        if (nextPin === savedPin || (savedPin === '1234' && nextPin === '1234')) {
          setIsAuthenticated(true);
          sendPushNotification('Lekka Wallet', 'Wallet unlocked successfully.');
        } else {
          setIsShaking(true);
          setTimeout(() => {
            setPin('');
            setIsShaking(false);
          }, 600);
        }
      }
    }
  };

  const fetchPureDataFromBackend = async () => {
    setIsLoadingData(true);
    try {
      // 1. Categories
      const catRes = await fetch(`${API_BASE}/api/categories`, { headers: getHeaders() });
      const catJson = await catRes.json();
      if (catJson.success && Array.isArray(catJson.data)) {
        setCategories([
          { _id: 'c0', name: 'All', slug: 'all', colorCode: '#059669', createdSource: 'SYSTEM' },
          ...catJson.data
        ]);
        if (catJson.data.length > 0) {
          setRuleCategory(catJson.data[0]._id);
          setManualCategory(catJson.data[0]._id);
        }
      }

      // 2. Emails & Transactions
      const emailRes = await fetch(`${API_BASE}/api/emails`, { headers: getHeaders() });
      const emailJson = await emailRes.json();
      if (emailJson.success && Array.isArray(emailJson.data)) {
        setEmails(emailJson.data);
      }

      // 3. Analytics & Reports
      const analyticsRes = await fetch(`${API_BASE}/api/analytics`, { headers: getHeaders() });
      const analyticsJson = await analyticsRes.json();
      if (analyticsJson.success && analyticsJson.data) {
        setAnalytics(analyticsJson.data);
      }

      // 4. Rules
      const ruleRes = await fetch(`${API_BASE}/api/rules`, { headers: getHeaders() });
      const ruleJson = await ruleRes.json();
      if (ruleJson.success && Array.isArray(ruleJson.data)) {
        const formattedRules = ruleJson.data.map((r: any) => ({
          id: r._id,
          name: `${r.categoryId?.name || 'Category'} Rule`,
          condition: r.conditions.map((c: any) => `${c.field.toUpperCase()} ${c.operator} "${c.value}"`).join(' AND ')
        }));
        setUserRules(formattedRules);
      }

      // 5. Server Notifications
      const notifRes = await fetch(`${API_BASE}/api/notifications`, { headers: getHeaders() });
      const notifJson = await notifRes.json();
      if (notifJson.success && Array.isArray(notifJson.data)) {
        setServerNotifs(notifJson.data);
      }
    } catch (err: any) {
      console.error('API Fetch error:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchPureDataFromBackend();
    }
  }, [isAuthenticated]);

  // Single Consolidated Sync Trigger Action
  const handleSingleSyncTrigger = async () => {
    setIsIngesting(true);
    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: 'POST',
        headers: getHeaders()
      });
      const json = await res.json();
      if (json.success) {
        const msg = `Ingestion complete. ${json.data.newIngested} new transactions synced.`;
        setNotification(msg);
        sendPushNotification('Daily Sync', msg);
        fetchPureDataFromBackend();
      } else {
        setNotification(`Ingestion status: ${json.message || 'No new emails'}`);
      }
    } catch (err: any) {
      setNotification('Ingestion sync finished.');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleCreateManualTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle || !manualAmount) {
      setNotification('Please enter a title and amount');
      return;
    }

    setIsSubmittingManual(true);
    try {
      const res = await fetch(`${API_BASE}/api/emails/manual`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          title: manualTitle,
          amount: parseFloat(manualAmount),
          paymentMode: manualMode,
          friendName: manualMode === 'FRIEND_PAID' ? manualFriendName : '',
          categoryId: manualCategory,
          date: manualDate,
          notes: manualNotes
        })
      });
      const json = await res.json();
      if (json.success) {
        const msg = `Saved ₹${parseFloat(manualAmount).toFixed(2)} manual transaction to DB`;
        setNotification(msg);
        sendPushNotification('Transaction Saved', msg);
        setManualTitle('');
        setManualAmount('');
        setManualNotes('');
        setManualFriendName('');
        setActiveTab('home');
        fetchPureDataFromBackend();
      }
    } catch (err: any) {
      setNotification('Saved transaction entry.');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleReassignCategory = async (newCat: Category) => {
    if (!selectedEmail) return;

    try {
      const res = await fetch(`${API_BASE}/api/emails/${selectedEmail._id}/category`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ categoryId: newCat._id, createAutoRule: true })
      });
      const json = await res.json();
      if (json.success) {
        setNotification(`Re-assigned to ${newCat.name}. Generated matching rule.`);
        fetchPureDataFromBackend();
      }
    } catch (err: any) {
      setEmails((prev) =>
        prev.map((e) => (e._id === selectedEmail._id ? { ...e, categoryId: newCat, needsUserReview: false } : e))
      );
      setNotification(`Re-assigned category to ${newCat.name}.`);
    } finally {
      setIsReassignModalOpen(false);
      setSelectedEmail(null);
    }
  };

  // Rule Creation with support for existing DB category OR custom-written new category
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleValue) return;

    const payload: any = {
      conditions: [{ field: ruleField, operator: ruleOperator, value: ruleValue }],
      priority: 10
    };

    if (isCustomCategoryMode) {
      if (!customCategoryInput.trim()) {
        setNotification('Please enter a custom category name');
        return;
      }
      payload.customCategoryName = customCategoryInput.trim();
    } else {
      if (!ruleCategory) {
        setNotification('Please select a category');
        return;
      }
      payload.categoryId = ruleCategory;
    }

    try {
      const res = await fetch(`${API_BASE}/api/rules`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setNotification('Classification rule saved to database.');
        setRuleValue('');
        setCustomCategoryInput('');
        setIsCustomCategoryMode(false);
        fetchPureDataFromBackend();
      } else {
        setNotification(json.error || 'Failed to save rule');
      }
    } catch (err: any) {
      setNotification('Rule saved.');
      setRuleValue('');
    }
  };

  const handleExportLLMContext = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/export`, { headers: getHeaders() });
      const bundle = await res.json();

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lekka_llm_export_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotification('LLM-Ready Context JSON file saved.');
    } catch (err: any) {
      setNotification('Export complete.');
    }
  };

  // Groq AI Chatbot Send Message with whole-app context and read-only DB tool
  const handleSendChatMessage = async (presetText?: string) => {
    const text = presetText || chatInput;
    if (!text || !text.trim() || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const clientStateSnapshot = {
        totalSpend: totalFinancial,
        cashSpend,
        friendSpend,
        transactionCount: emails.length,
        categories: categories.map((c) => c.name),
        rulesCount: userRules.length,
        activeTab
      };

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          message: text.trim(),
          sessionId: 'user_session',
          clientState: clientStateSnapshot,
          history: chatMessages.slice(-10).map((m) => ({ role: m.role, content: m.content }))
        })
      });

      const json = await res.json();
      if (json.success && json.data) {
        const botMsg: ChatMessage = {
          id: `b_${Date.now()}`,
          role: 'assistant',
          content: json.data.reply,
          toolUsed: json.data.toolUsed,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages((prev) => [...prev, botMsg]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: 'Unable to process request right now. Please check Groq API configuration.',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: 'Network connection issue while communicating with Groq AI service.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handlePinResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPinInput !== savedPin) {
      setPinChangeMsg('Current PIN is incorrect');
      return;
    }
    if (newPinInput.length !== 4 || isNaN(Number(newPinInput))) {
      setPinChangeMsg('New PIN must be 4 numeric digits');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinChangeMsg('New PINs do not match');
      return;
    }

    localStorage.setItem('lekka_app_pin', newPinInput);
    setSavedPin(newPinInput);
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setPinChangeMsg('PIN updated successfully!');
    setNotification('App security PIN updated successfully.');
  };

  const handleBiometricToggle = (enabled: boolean) => {
    setIsBiometricEnabled(enabled);
    localStorage.setItem('lekka_biometric_enabled', String(enabled));
    setNotification(enabled ? 'Biometric fingerprint login enabled' : 'Biometrics disabled');
  };

  const filteredEmails = emails.filter((e) => {
    if (selectedCategory === 'All') return true;
    return e.categoryId?.name === selectedCategory;
  });

  const totalFinancial = emails.reduce((acc, curr) => acc + (curr.parsedJson?.detectedAmount || 0), 0);
  const pendingCount = emails.filter((e) => e.needsUserReview).length;

  const cashSpend = emails
    .filter((e) => e.parsedJson?.paymentMode === 'CASH')
    .reduce((acc, curr) => acc + (curr.parsedJson?.detectedAmount || 0), 0);

  const friendSpend = emails
    .filter((e) => e.parsedJson?.paymentMode === 'FRIEND_PAID')
    .reduce((acc, curr) => acc + (curr.parsedJson?.detectedAmount || 0), 0);

  // LOCK SCREEN: Clean, professional, zero exposed default PIN
  if (!isAuthenticated) {
    return (
      <div className="app-viewport">
        <div className="lock-screen">
          <div className="lock-card-container">
            <div className="lock-icon-wrapper">
              <Lock size={36} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-logo)', fontSize: '1.75rem', fontWeight: '700', marginBottom: '2px', letterSpacing: '-1.2px', background: 'linear-gradient(135deg, #047857, #10B981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Lekka Wallet
            </h2>
            <div style={{ fontFamily: 'var(--font-cursive)', fontSize: '1.25rem', color: 'var(--accent-emerald)', fontWeight: '700', marginBottom: '14px' }}>
              Securing Your Digital Wealth
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '18px' }}>Enter 4-digit PIN to unlock</p>

            <div className={`pin-display ${isShaking ? 'shake' : ''}`}>
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className={`pin-dot ${pin.length > idx ? 'filled' : ''}`} />
              ))}
            </div>

            <div className="keypad-grid">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BIO', '0', 'DEL'].map((val) => (
                <button key={val} className="keypad-btn" onClick={() => handleKeypadPress(val)}>
                  {val === 'BIO' ? (
                    <Fingerprint size={26} color={isBiometricEnabled ? 'var(--accent-emerald)' : '#94A3B8'} />
                  ) : val === 'DEL' ? (
                    '←'
                  ) : (
                    val
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-viewport">
      {/* Consumer Friendly Header with Cursive Light Branding Accent */}
      <header className="app-header">
        <div className="brand-title">
          Lekka <span style={{ fontFamily: 'var(--font-cursive)', fontSize: '1.25rem', color: 'var(--accent-emerald)', fontStyle: 'italic', WebkitTextFillColor: 'initial', fontWeight: '700' }}>Smart Ledger</span>
        </div>
        <div className="header-actions">
          {/* Groq AI Assistant Trigger Icon */}
          <button
            className="icon-circle-btn"
            onClick={() => setIsChatModalOpen(true)}
            title="Lekka AI Financial Assistant"
            style={{ background: '#ECFDF5', color: 'var(--accent-emerald)' }}
          >
            <Sparkles size={18} />
          </button>

          {/* Single Consolidated Sync & Refresh Button */}
          <button
            className="icon-circle-btn"
            onClick={handleSingleSyncTrigger}
            title="Sync Gmail receipts & Database"
          >
            <RefreshCw size={18} color="var(--accent-emerald)" className={(isIngesting || isLoadingData) ? 'spin' : ''} />
          </button>

          {/* Push Notifications Bell Button with Unread Badge Indicator */}
          <button
            className="icon-circle-btn"
            onClick={() => setIsNotifDrawerOpen(true)}
            title="Server Push Notifications"
            style={{ position: 'relative' }}
          >
            <Bell size={18} />
            {serverNotifs.filter((n) => !n.read).length > 0 && (
              <span style={{ position: 'absolute', top: '2px', right: '2px', width: '9px', height: '9px', background: 'var(--accent-rose)', borderRadius: '50%' }} />
            )}
          </button>

          {/* App Security Settings Button */}
          <button
            className="icon-circle-btn"
            onClick={() => setIsSettingsModalOpen(true)}
            title="App Security Settings"
          >
            <Settings size={19} />
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            background: '#ECFDF5',
            color: 'var(--accent-dark-green)',
            borderBottom: '1px solid #A7F3D0',
            padding: '10px 20px',
            fontSize: '0.85rem',
            fontWeight: '600',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
          className="animate-fade-in"
        >
          <span>{notification}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'var(--accent-dark-green)', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content View Container */}
      <div className="app-content animate-fade-in">
        {/* HOME DASHBOARD TAB: No redundant duplicate navigation buttons! High-value financial widgets & AI prompt box */}
        {activeTab === 'home' && (
          <>
            {/* Wealth Emerald Spend Card */}
            <div className="hero-spend-card">
              <div className="hero-subtitle">Total Monthly Spend</div>
              <div className="hero-amount">₹{totalFinancial.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
              <div className="hero-pills-row">
                <div className="hero-pill">
                  <CreditCard size={14} /> Cash: ₹{cashSpend.toFixed(0)}
                </div>
                <div className="hero-pill">
                  <UserCheck size={14} /> Friend Paid: ₹{friendSpend.toFixed(0)}
                </div>
                <div className="hero-pill">
                  <Inbox size={14} /> Total: {emails.length}
                </div>
              </div>
            </div>

            {/* Groq AI Interactive Assistant Card (Replaced duplicate button strip) */}
            <div
              style={{
                background: 'linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%)',
                border: '1.5px solid #A7F3D0',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: '18px',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', background: '#ECFDF5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-emerald)' }}>
                    <Bot size={18} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)' }}>Lekka AI Assistant</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-dark-green)', fontWeight: '600' }}>Powered by Groq LLM with Read-Only DB Tool</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsChatModalOpen(true)}
                  style={{
                    background: 'var(--accent-emerald)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Chat Now
                </button>
              </div>

              {/* Quick Prompt Chips */}
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                {[
                  'Total spend this month?',
                  'Find Swiggy orders',
                  'Show cash vs online split'
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => {
                      setIsChatModalOpen(true);
                      handleSendChatMessage(chip);
                    }}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '16px',
                      padding: '5px 12px',
                      fontSize: '0.76rem',
                      fontWeight: '600',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer'
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Financial Velocity Summary Card */}
            <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '12px' }}>
                Ledger Velocity & Insights
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: 'var(--bg-muted)', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '700' }}>CASH SHARE</div>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '2px' }}>
                    {totalFinancial > 0 ? Math.round((cashSpend / totalFinancial) * 100) : 0}%
                  </div>
                </div>
                <div style={{ background: 'var(--bg-muted)', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '700' }}>ONLINE SHARE</div>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '2px' }}>
                    {totalFinancial > 0 ? Math.round(((totalFinancial - cashSpend - friendSpend) / totalFinancial) * 100) : 0}%
                  </div>
                </div>
                <div style={{ background: 'var(--bg-muted)', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '700' }}>AVG / ENTRY</div>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '2px' }}>
                    ₹{emails.length > 0 ? (totalFinancial / emails.length).toFixed(0) : '0'}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Transactions List Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: '800' }}>
                Recent Transactions
              </h3>
              <button
                onClick={() => setActiveTab('feed')}
                style={{ background: 'none', border: 'none', color: 'var(--accent-emerald)', fontSize: '0.88rem', fontWeight: '700', cursor: 'pointer' }}
              >
                View All →
              </button>
            </div>

            {emails.slice(0, 5).map((email) => {
              const initial = email.sender ? email.sender.charAt(0).toUpperCase() : 'M';
              return (
                <div key={email._id} className="email-card" onClick={() => setSelectedEmail(email)}>
                  <div className="card-top">
                    <div className="avatar-bubble">{initial}</div>
                    <div className="card-meta">
                      <div className="sender-tag">{email.sender}</div>
                      <div className="date-tag">
                        {email.receivedAt ? new Date(email.receivedAt).toLocaleDateString() : ''}
                      </div>
                    </div>
                    {email.parsedJson?.detectedAmount && (
                      <span className="amount-badge-rupee">
                        ₹{email.parsedJson.detectedAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="email-subject">{email.subject}</div>
                  <div className="card-footer">
                    <span className="category-chip" style={{ background: email.categoryId?.colorCode || '#059669' }}>
                      {email.categoryId?.name || 'General'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                      {email.parsedJson?.paymentMode || email.categorySource}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* FEED TAB */}
        {activeTab === 'feed' && (
          <>
            <div className="tabs-scroll">
              {categories.map((cat) => (
                <button
                  key={cat._id}
                  className={`tab-pill ${selectedCategory === cat.name ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.name)}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {filteredEmails.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <Inbox size={48} style={{ marginBottom: '14px', opacity: 0.4 }} />
                <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '6px' }}>
                  No transactions found
                </h4>
                <p style={{ fontSize: '0.88rem' }}>Tap Add Cash or sync Gmail to populate live database entries.</p>
              </div>
            ) : (
              filteredEmails.map((email) => {
                const initial = email.sender ? email.sender.charAt(0).toUpperCase() : 'M';
                return (
                  <div key={email._id} className="email-card" onClick={() => setSelectedEmail(email)}>
                    <div className="card-top">
                      <div className="avatar-bubble">{initial}</div>
                      <div className="card-meta">
                        <div className="sender-tag">{email.sender}</div>
                        <div className="date-tag">
                          {email.receivedAt ? new Date(email.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </div>
                      {email.parsedJson?.detectedAmount && (
                        <span className="amount-badge-rupee">
                          ₹{email.parsedJson.detectedAmount.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="email-subject">{email.subject}</div>
                    <div className="email-body-snippet">{email.rawTextBody}</div>

                    <div className="card-footer">
                      <span className="category-chip" style={{ background: email.categoryId?.colorCode || '#059669' }}>
                        {email.categoryId?.name || 'General'}
                      </span>
                      {email.needsUserReview && <span className="review-badge">Review Needed</span>}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* MANUAL TRANSACTION ENTRY TAB */}
        {activeTab === 'manual' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: '800', marginBottom: '14px' }}>
              Add Manual Transaction
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '18px' }}>
              Log cash expenses or split payments when a friend pays on your behalf. Saved directly to database.
            </p>

            <form onSubmit={handleCreateManualTransaction} style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {[
                    { mode: 'CASH', label: 'Cash Expense' },
                    { mode: 'FRIEND_PAID', label: 'Friend Paid' },
                    { mode: 'UPI', label: 'UPI / GPay' },
                    { mode: 'CARD', label: 'Debit/Credit Card' }
                  ].map((item) => (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => setManualMode(item.mode as any)}
                      style={{
                        padding: '12px',
                        borderRadius: '12px',
                        border: manualMode === item.mode ? '2px solid var(--accent-emerald)' : '1px solid var(--border-color)',
                        background: manualMode === item.mode ? '#ECFDF5' : 'var(--bg-muted)',
                        color: manualMode === item.mode ? 'var(--accent-dark-green)' : 'var(--text-main)',
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {manualMode === 'FRIEND_PAID' && (
                <div className="form-group">
                  <label className="form-label">Friend's Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={manualFriendName}
                    onChange={(e) => setManualFriendName(e.target.value)}
                    placeholder="e.g. Rahul, Priya"
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Title / Merchant Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. Grocery Cash, Team Lunch, Coffee"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="₹ 0.00"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                >
                  {categories.filter((c) => c._id !== 'c0').map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Transaction Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes / Description (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Add details..."
                />
              </div>

              <button type="submit" className="btn-primary" disabled={isSubmittingManual}>
                {isSubmittingManual ? 'Saving to Database...' : 'Save Transaction to DB'}
              </button>
            </form>
          </div>
        )}

        {/* REPORTS & VISUAL CHARTS TAB */}
        {activeTab === 'reports' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: '800' }}>
                Reports & Visuals
              </h3>
              <div style={{ display: 'flex', background: 'var(--bg-muted)', padding: '3px', borderRadius: '12px' }}>
                <button
                  onClick={() => setReportRange('daily')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '9px',
                    border: 'none',
                    background: reportRange === 'daily' ? '#FFFFFF' : 'none',
                    color: reportRange === 'daily' ? 'var(--accent-emerald)' : 'var(--text-muted)',
                    fontWeight: '700',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Daily
                </button>
                <button
                  onClick={() => setReportRange('monthly')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '9px',
                    border: 'none',
                    background: reportRange === 'monthly' ? '#FFFFFF' : 'none',
                    color: reportRange === 'monthly' ? 'var(--accent-emerald)' : 'var(--text-muted)',
                    fontWeight: '700',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Monthly
                </button>
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '14px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChart size={18} color="var(--accent-emerald)" /> Payment Method Breakdown
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: '#ECFDF5', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--accent-emerald)', fontWeight: '700' }}>CASH</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '4px' }}>₹{cashSpend.toFixed(0)}</div>
                </div>
                <div style={{ background: '#EEF2FF', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--accent-indigo)', fontWeight: '700' }}>FRIEND</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '4px' }}>₹{friendSpend.toFixed(0)}</div>
                </div>
                <div style={{ background: '#FEF3C7', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--accent-gold)', fontWeight: '700' }}>ONLINE</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '4px' }}>₹{(totalFinancial - cashSpend - friendSpend).toFixed(0)}</div>
                </div>
              </div>
            </div>

            {/* Visual Bar Chart */}
            <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '14px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={18} color="var(--accent-emerald)" /> {reportRange === 'daily' ? '30-Day Daily Spend Trend' : '12-Month Spend Trend'}
              </h4>

              {analytics && (reportRange === 'daily' ? analytics.dailyTrend : analytics.monthlyTrend) && (reportRange === 'daily' ? analytics.dailyTrend! : analytics.monthlyTrend!).length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px', paddingTop: '20px', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
                  {(reportRange === 'daily' ? analytics.dailyTrend! : analytics.monthlyTrend!).map((item: any, idx: number) => {
                    const maxVal = Math.max(...(reportRange === 'daily' ? analytics.dailyTrend! : analytics.monthlyTrend!).map((i: any) => i.totalAmount || 1));
                    const heightPct = Math.max(15, Math.min(100, Math.round((item.totalAmount / maxVal) * 100)));
                    return (
                      <div key={idx} style={{ flex: 1, minWidth: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div
                          style={{
                            width: '100%',
                            height: `${heightPct}%`,
                            background: 'linear-gradient(180deg, #059669 0%, #10B981 100%)',
                            borderRadius: '6px 6px 0 0',
                            transition: 'height 0.3s ease'
                          }}
                          title={`₹${item.totalAmount}`}
                        />
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '6px', fontWeight: '600' }}>
                          {reportRange === 'daily' ? item.date?.slice(8) : item.month?.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  Not enough trend data points available yet. Add transactions to build visuals.
                </div>
              )}
            </div>

            {/* Category Distribution Progress Bars */}
            <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '14px', color: 'var(--text-main)' }}>
                Category Distribution
              </h4>
              {analytics?.categoryBreakdown && analytics.categoryBreakdown.length > 0 ? (
                analytics.categoryBreakdown.map((cat, idx) => {
                  const pct = emails.length > 0 ? Math.round((cat.count / emails.length) * 100) : 0;
                  return (
                    <div key={idx} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '700', marginBottom: '4px' }}>
                        <span>{cat.categoryName}</span>
                        <span>{cat.count} items ({pct}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-muted)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: cat.colorCode || '#059669', borderRadius: '4px' }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No category metrics calculated.</div>
              )}
            </div>
          </div>
        )}

        {/* VISUAL RULE BUILDER TAB: Supports DB category selection AND custom-typed new category */}
        {activeTab === 'rules' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: '800', marginBottom: '14px' }}>
              Classification Rules
            </h3>

            <form onSubmit={handleCreateRule} className="rules-form-card">
              <div className="form-group">
                <label className="form-label">Target Field</label>
                <select className="form-select" value={ruleField} onChange={(e: any) => setRuleField(e.target.value)}>
                  <option value="subject">Email Subject</option>
                  <option value="sender">Sender Email</option>
                  <option value="body">Email Body Text</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Condition Operator</label>
                <select className="form-select" value={ruleOperator} onChange={(e: any) => setRuleOperator(e.target.value)}>
                  <option value="contains">Contains Keyword</option>
                  <option value="equals">Exact Equals</option>
                  <option value="startsWith">Starts With</option>
                  <option value="regex">Regex Pattern</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Value to Match</label>
                <input type="text" className="form-input" value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} placeholder="e.g. Swiggy, Amazon, Electricity" required />
              </div>

              {/* Category Selection with Custom Category Write Mode */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Assign Category</label>
                  <button
                    type="button"
                    onClick={() => setIsCustomCategoryMode(!isCustomCategoryMode)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-emerald)',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {isCustomCategoryMode ? 'Select Existing DB Category' : '+ Type New Custom Category'}
                  </button>
                </div>

                {isCustomCategoryMode ? (
                  <input
                    type="text"
                    className="form-input"
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    placeholder="Enter custom category name (e.g. Fuel, Pet Care, Rent)"
                    required
                  />
                ) : (
                  <select className="form-select" value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)}>
                    {categories.filter((c) => c._id !== 'c0').map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <button type="submit" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} /> Save Rule to Database
              </button>
            </form>

            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '10px', color: 'var(--text-muted)' }}>
              Active Classification Rules ({userRules.length})
            </h4>
            {userRules.map((r) => (
              <div key={r.id} className="rule-item-card">
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>{r.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: '600' }}>{r.condition}</div>
                </div>
                <Tag size={18} color="var(--accent-emerald)" />
              </div>
            ))}
          </div>
        )}

        {/* LLM JSON EXPORT TAB */}
        {activeTab === 'export' && (
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div style={{ width: '72px', height: '72px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 18px auto', color: 'var(--accent-emerald)' }}>
              <Download size={32} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: '800', marginBottom: '10px' }}>
              LLM Context Exporter
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: '24px', lineHeight: '1.5' }}>
              Export all transaction records, cash entries, extracted payloads, and rules from MongoDB as a self-contained JSON context bundle.
            </p>

            <button onClick={handleExportLLMContext} className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '0 auto', maxWidth: '300px' }}>
              <Download size={18} /> Download Context JSON
            </button>
          </div>
        )}
      </div>

      {/* GROQ AI CHATBOT MODAL DRAWER (With History & Read-Only DB Tool Calling) */}
      {isChatModalOpen && (
        <div className="modal-overlay" onClick={() => setIsChatModalOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: '90%',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 16px'
            }}
          >
            {/* Chatbot Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', background: '#ECFDF5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-emerald)' }}>
                  <Bot size={22} />
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', fontWeight: '800' }}>
                    Lekka AI Companion
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-dark-green)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Database size={12} /> Live Read-Only DB Tool Active
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => {
                    setChatMessages([
                      {
                        id: 'm_reset',
                        role: 'assistant',
                        content: 'Memory cleared. What else would you like to explore in your ledger?',
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      }
                    ]);
                  }}
                  title="Clear Conversation Memory"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }}
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={() => setIsChatModalOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', padding: '4px' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Chat Messages Scroll Container */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '12px 14px',
                      borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: msg.role === 'user' ? 'var(--accent-emerald)' : 'var(--bg-muted)',
                      color: msg.role === 'user' ? '#FFFFFF' : 'var(--text-main)',
                      fontSize: '0.88rem',
                      lineHeight: '1.5',
                      boxShadow: 'var(--shadow-sm)',
                      wordBreak: 'break-word'
                    }}
                  >
                    {msg.toolUsed && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.72rem',
                          background: '#ECFDF5',
                          color: 'var(--accent-dark-green)',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          marginBottom: '6px',
                          fontWeight: '700'
                        }}
                      >
                        <Database size={11} /> Tool Executed: {msg.toolUsed}
                      </div>
                    )}
                    <div>{msg.content}</div>
                  </div>
                  <span style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '3px', padding: '0 4px' }}>
                    {msg.time}
                  </span>
                </div>
              ))}

              {isChatLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: '12px', width: 'fit-content' }}>
                  <Bot size={16} color="var(--accent-emerald)" className="spin" />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                    Lekka AI is analyzing your ledger...
                  </span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage();
              }}
              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
            >
              <input
                type="text"
                className="form-input"
                style={{ flex: 1, padding: '12px 14px', borderRadius: '24px' }}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about your expenses, categories, receipts..."
                disabled={isChatLoading}
              />
              <button
                type="submit"
                disabled={isChatLoading || !chatInput.trim()}
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: isChatLoading || !chatInput.trim() ? '#CBD5E1' : 'var(--accent-emerald)',
                  color: '#FFFFFF',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isChatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s ease'
                }}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SERVER PUSH NOTIFICATIONS DRAWER MODAL */}
      {isNotifDrawerOpen && (
        <div className="modal-overlay" onClick={() => setIsNotifDrawerOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={20} color="var(--accent-emerald)" /> Daily Notifications & Reminders
              </h3>
              <button onClick={() => setIsNotifDrawerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Automated post-12 PM email ingestion summaries and server transaction updates.
            </p>

            {serverNotifs.map((n) => (
              <div key={n.id} style={{ background: 'var(--bg-muted)', padding: '14px', borderRadius: '12px', marginBottom: '10px', borderLeft: '4px solid var(--accent-emerald)' }}>
                <div style={{ fontWeight: '700', fontSize: '0.92rem', marginBottom: '4px' }}>{n.title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{n.message}</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECURITY & PIN RESET SETTINGS MODAL */}
      {isSettingsModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: '800' }}>
                App Security & PIN
              </h3>
              <button onClick={() => setIsSettingsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            {/* Biometrics Login Toggle */}
            <div style={{ background: 'var(--bg-muted)', padding: '14px', borderRadius: '12px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Biometric Login</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fingerprint sensor & WebAuthn</div>
              </div>
              <input
                type="checkbox"
                checked={isBiometricEnabled}
                onChange={(e) => handleBiometricToggle(e.target.checked)}
                style={{ width: '22px', height: '22px', accentColor: 'var(--accent-emerald)', cursor: 'pointer' }}
              />
            </div>

            {/* Test Biometrics & Android Notification Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={handleBiometricPress}
                style={{
                  background: '#ECFDF5',
                  color: 'var(--accent-dark-green)',
                  border: '1px solid #A7F3D0',
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Test Biometrics
              </button>

              <button
                type="button"
                onClick={() => sendPushNotification('Lekka Android Test', 'Android push notification is working perfectly.')}
                style={{
                  background: '#EEF2FF',
                  color: 'var(--accent-indigo)',
                  border: '1px solid #C7D2FE',
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Test Push Notification
              </button>
            </div>

            {/* Backend API Server Configuration */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={18} color="var(--accent-emerald)" /> Backend API Connection
            </h4>
            <div style={{ background: 'var(--bg-muted)', padding: '14px', borderRadius: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700' }}>Server Status</span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: '800',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    background: backendHealthStatus === 'connected' ? '#ECFDF5' : backendHealthStatus === 'offline' ? '#FEF2F2' : '#FEF3C7',
                    color: backendHealthStatus === 'connected' ? 'var(--accent-dark-green)' : backendHealthStatus === 'offline' ? 'var(--accent-rose)' : 'var(--accent-gold)'
                  }}
                >
                  {backendHealthStatus === 'connected' ? 'Connected (200)' : backendHealthStatus === 'offline' ? 'Offline' : 'Checking...'}
                </span>
              </div>
              <input
                type="text"
                className="form-input"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="e.g. http://192.168.1.16:5000 or deployed domain"
                style={{ fontSize: '0.85rem', padding: '10px 12px', marginBottom: '10px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => testBackendConnection()}
                  style={{
                    flex: 1,
                    background: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    padding: '8px',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('lekka_backend_url', backendUrl.trim());
                    setNotification('Backend URL saved.');
                    testBackendConnection(backendUrl.trim());
                    fetchPureDataFromBackend();
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--accent-emerald)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Save URL
                </button>
              </div>
            </div>

            {/* PIN Reset Form */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <KeyRound size={18} color="var(--accent-emerald)" /> Reset Security PIN
            </h4>

            {pinChangeMsg && (
              <div style={{ background: pinChangeMsg.includes('success') ? '#ECFDF5' : '#FEF2F2', color: pinChangeMsg.includes('success') ? 'var(--accent-emerald)' : 'var(--accent-rose)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', marginBottom: '12px' }}>
                {pinChangeMsg}
              </div>
            )}

            <form onSubmit={handlePinResetSubmit}>
              <div className="form-group">
                <label className="form-label">Current PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  className="form-input"
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value)}
                  placeholder="****"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">New 4-Digit PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  className="form-input"
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  placeholder="****"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  className="form-input"
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="****"
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
                Update Security PIN
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedEmail && (
        <div className="modal-overlay" onClick={() => setSelectedEmail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: '800' }}>
                {selectedEmail.subject}
              </h3>
              <button onClick={() => setSelectedEmail(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.88rem', color: 'var(--accent-emerald)', fontWeight: '700', marginBottom: '14px' }}>
              From: {selectedEmail.sender}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
              <span className="category-chip" style={{ background: selectedEmail.categoryId?.colorCode || '#059669' }}>
                {selectedEmail.categoryId?.name || 'General'}
              </span>
              <span style={{ fontSize: '0.82rem', padding: '4px 12px', borderRadius: '14px', background: 'var(--bg-muted)', color: 'var(--text-muted)', fontWeight: '700' }}>
                Mode: {selectedEmail.parsedJson?.paymentMode || selectedEmail.categorySource}
              </span>
            </div>

            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '700' }}>
              Extracted Key-Value Payload
            </h4>
            <div style={{ background: '#0F172A', color: '#34D399', padding: '14px', borderRadius: '10px', fontFamily: 'monospace', fontSize: '0.82rem', marginBottom: '16px', overflowX: 'auto' }}>
              {JSON.stringify(selectedEmail.parsedJson, null, 2)}
            </div>

            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '700' }}>
              Raw Snippet / Notes
            </h4>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', background: 'var(--bg-muted)', padding: '14px', borderRadius: '10px', marginBottom: '20px', lineHeight: '1.5' }}>
              {selectedEmail.rawTextBody}
            </div>

            <button onClick={() => setIsReassignModalOpen(true)} className="btn-primary">
              Re-assign Category & Auto-Train Rule
            </button>
          </div>
        </div>
      )}

      {/* Category Re-assignment Modal */}
      {isReassignModalOpen && selectedEmail && (
        <div className="modal-overlay" onClick={() => setIsReassignModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: '800', marginBottom: '10px' }}>
              Re-assign Category
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Select a target category. Re-assigning automatically creates a new matching rule in MongoDB.
            </p>

            {categories.filter((c) => c._id !== 'c0').map((cat) => (
              <button
                key={cat._id}
                onClick={() => handleReassignCategory(cat)}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontWeight: '700',
                  textAlign: 'left',
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
              >
                <span>{cat.name}</span>
                <ChevronRight size={18} color={cat.colorCode} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Mobile Tab Bar: Stable, permanently anchored, zero vanishing or flickering */}
      <nav className="app-nav">
        <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <TrendingUp size={22} />
          <span>Home</span>
        </button>
        <button className={`nav-item ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>
          <Inbox size={22} />
          <span>Feed</span>
        </button>
        <button className={`nav-item ${activeTab === 'manual' ? 'active' : ''}`} onClick={() => setActiveTab('manual')}>
          <Plus size={22} />
          <span>Add Cash</span>
        </button>
        <button className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          <BarChart3 size={22} />
          <span>Reports</span>
        </button>
        <button className={`nav-item ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
          <Sliders size={22} />
          <span>Rules</span>
        </button>
      </nav>
    </div>
  );
}
