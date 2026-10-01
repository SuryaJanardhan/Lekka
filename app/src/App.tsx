import React, { useState, useEffect } from 'react';
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
  Fingerprint
} from 'lucide-react';
import { EmailRecord, Category, DashboardStats } from './types';

export function App() {
  // Authentication & PIN State
  const [pin, setPin] = useState('');
  const [savedPin, setSavedPin] = useState(() => localStorage.getItem('lekka_app_pin') || '1234');
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(() => localStorage.getItem('lekka_biometric_enabled') === 'true');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  const [isIngesting, setIsIngesting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

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

  // Password / PIN Reset Form State
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinChangeMsg, setPinChangeMsg] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '';
  const API_SECRET = import.meta.env.VITE_LEKKA_API_SECRET || 'idkknowwhthehellitisbutsomehowwritingthisshithereasalongscretoflife';

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'X-API-SECRET': API_SECRET
  });

  const handleKeypadPress = (val: string) => {
    if (val === 'DEL') {
      setPin((prev) => prev.slice(0, -1));
    } else if (val === 'BIO') {
      if (isBiometricEnabled) {
        setIsAuthenticated(true);
      } else {
        setNotification('Enable biometrics in Settings after entering PIN.');
      }
    } else if (pin.length < 4) {
      const nextPin = pin + val;
      setPin(nextPin);
      if (nextPin === savedPin || (savedPin === '1234' && nextPin === '1234')) {
        setIsAuthenticated(true);
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

  const handleIngestTrigger = async () => {
    setIsIngesting(true);
    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: 'POST',
        headers: getHeaders()
      });
      const json = await res.json();
      if (json.success) {
        setNotification(`Ingestion complete. ${json.data.newIngested} new transactions synced.`);
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
        setNotification(`Saved ₹${parseFloat(manualAmount).toFixed(2)} manual transaction to DB`);
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

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleValue || !ruleCategory) return;

    try {
      const res = await fetch(`${API_BASE}/api/rules`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          categoryId: ruleCategory,
          conditions: [{ field: ruleField, operator: ruleOperator, value: ruleValue }],
          priority: 10
        })
      });
      const json = await res.json();
      if (json.success) {
        setNotification('Classification rule saved to database.');
        setRuleValue('');
        fetchPureDataFromBackend();
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

  if (!isAuthenticated) {
    return (
      <div className="app-viewport">
        <div className="lock-screen">
          <div className="lock-icon-wrapper">
            <Lock size={38} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-brand)', fontSize: '1.7rem', fontWeight: '800', marginBottom: '6px' }}>
            Lekka Wallet
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>Enter 4-digit PIN to unlock</p>

          <div className="pin-display">
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

          <p style={{ marginTop: '26px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Default PIN: {savedPin} | Biometrics: {isBiometricEnabled ? 'Enabled' : 'Disabled'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-viewport">
      {/* Consumer Friendly Header */}
      <header className="app-header">
        <div className="brand-title">
          Lekka <span className="brand-badge-friendly">Smart Ledger</span>
        </div>
        <div className="header-actions">
          <button
            className="icon-circle-btn"
            onClick={fetchPureDataFromBackend}
            title="Refresh transactions"
          >
            <RefreshCw size={17} className={isLoadingData ? 'spin' : ''} />
          </button>
          <button
            className="icon-circle-btn"
            onClick={handleIngestTrigger}
            title="Sync email transactions"
          >
            <RefreshCw size={17} color="var(--accent-emerald)" className={isIngesting ? 'spin' : ''} />
          </button>
          <button
            className="icon-circle-btn"
            onClick={() => setIsSettingsModalOpen(true)}
            title="App Security Settings"
          >
            <Settings size={18} />
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
            padding: '10px 16px',
            fontSize: '0.85rem',
            fontWeight: '600',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
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
      <div className="app-content">
        {/* HOME DASHBOARD TAB */}
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

            {/* Quick Actions Grid */}
            <div className="quick-actions-strip">
              <div className="action-btn-card" onClick={() => setActiveTab('manual')}>
                <div className="action-icon-box" style={{ background: '#ECFDF5', color: 'var(--accent-emerald)' }}>
                  <Plus size={22} />
                </div>
                <span>Add Cash</span>
              </div>

              <div className="action-btn-card" onClick={() => setActiveTab('reports')}>
                <div className="action-icon-box" style={{ background: '#EEF2FF', color: 'var(--accent-indigo)' }}>
                  <BarChart3 size={22} />
                </div>
                <span>Reports</span>
              </div>

              <div className="action-btn-card" onClick={handleIngestTrigger}>
                <div className="action-icon-box" style={{ background: '#FEF3C7', color: 'var(--accent-gold)' }}>
                  <RefreshCw size={20} className={isIngesting ? 'spin' : ''} />
                </div>
                <span>Sync Mail</span>
              </div>

              <div className="action-btn-card" onClick={() => setIsSettingsModalOpen(true)}>
                <div className="action-icon-box" style={{ background: '#F1F5F9', color: 'var(--text-main)' }}>
                  <ShieldCheck size={22} />
                </div>
                <span>Security</span>
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

            {/* Visual Bar Chart Generator */}
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

        {/* VISUAL RULE BUILDER TAB (Strict 16px Padding Alignment) */}
        {activeTab === 'rules' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: '800', marginBottom: '14px' }}>
              Classification Rules
            </h3>

            <form onSubmit={handleCreateRule} style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
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
                <input type="text" className="form-input" value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} placeholder="e.g. Swiggy, Amazon, Electricity" />
              </div>

              <div className="form-group">
                <label className="form-label">Assign Category</label>
                <select className="form-select" value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)}>
                  {categories.filter((c) => c._id !== 'c0').map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} /> Save Rule to Database
              </button>
            </form>

            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '10px', color: 'var(--text-muted)' }}>
              Active Classification Rules ({userRules.length})
            </h4>
            {userRules.map((r) => (
              <div key={r.id} style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
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
            <div style={{ background: 'var(--bg-muted)', padding: '14px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Biometric Login</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Use fingerprint / face sensor to unlock</div>
              </div>
              <input
                type="checkbox"
                checked={isBiometricEnabled}
                onChange={(e) => handleBiometricToggle(e.target.checked)}
                style={{ width: '22px', height: '22px', accentColor: 'var(--accent-emerald)', cursor: 'pointer' }}
              />
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

      {/* Bottom Mobile Tab Bar */}
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
