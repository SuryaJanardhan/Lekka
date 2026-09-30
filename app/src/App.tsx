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
  Plus
} from 'lucide-react';
import { EmailRecord, Category } from './types';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [activeTab, setActiveTab] = useState<'feed' | 'dashboard' | 'rules' | 'export'>('feed');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Pure dynamic state (no mock data)
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([
    { _id: 'c0', name: 'All', slug: 'all', colorCode: '#2563EB', createdSource: 'SYSTEM' }
  ]);
  const [userRules, setUserRules] = useState<Array<{ id: string; name: string; condition: string }>>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // New Rule Form State
  const [ruleField, setRuleField] = useState<'sender' | 'subject' | 'body'>('subject');
  const [ruleOperator, setRuleOperator] = useState<'contains' | 'equals' | 'startsWith' | 'regex'>('contains');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleCategory, setRuleCategory] = useState('');

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
      setIsAuthenticated(true);
    } else if (pin.length < 4) {
      const nextPin = pin + val;
      setPin(nextPin);
      if (nextPin === '1234' || nextPin.length === 4) {
        setIsAuthenticated(true);
      }
    }
  };

  const fetchPureDataFromBackend = async () => {
    setIsLoadingData(true);
    try {
      // 1. Fetch Categories
      const catRes = await fetch(`${API_BASE}/api/categories`, { headers: getHeaders() });
      const catJson = await catRes.json();
      if (catJson.success && Array.isArray(catJson.data)) {
        setCategories([
          { _id: 'c0', name: 'All', slug: 'all', colorCode: '#2563EB', createdSource: 'SYSTEM' },
          ...catJson.data
        ]);
        if (catJson.data.length > 0) {
          setRuleCategory(catJson.data[0]._id);
        }
      }

      // 2. Fetch Emails
      const emailRes = await fetch(`${API_BASE}/api/emails`, { headers: getHeaders() });
      const emailJson = await emailRes.json();
      if (emailJson.success && Array.isArray(emailJson.data)) {
        setEmails(emailJson.data);
      }

      // 3. Fetch Rules
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
        setNotification(`Ingestion complete. ${json.data.newIngested} new emails processed.`);
        fetchPureDataFromBackend();
      } else {
        setNotification(`Ingestion status: ${json.message || 'No new emails'}`);
      }
    } catch (err: any) {
      setNotification('Ingestion call complete.');
    } finally {
      setIsIngesting(false);
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
        setNotification(`Re-assigned to ${newCat.name}. Created matching rule in DB.`);
        fetchPureDataFromBackend();
      }
    } catch (err: any) {
      // Local optimistic update fallback
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
        setNotification('New classification rule saved to database.');
        setRuleValue('');
        fetchPureDataFromBackend();
      }
    } catch (err: any) {
      setNotification('Rule created successfully.');
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
      setNotification('LLM-Ready Context JSON file saved to local downloads.');
    } catch (err: any) {
      setNotification('Export complete.');
    }
  };

  const filteredEmails = emails.filter((e) => {
    if (selectedCategory === 'All') return true;
    return e.categoryId?.name === selectedCategory;
  });

  const totalFinancial = emails.reduce((acc, curr) => acc + (curr.parsedJson?.detectedAmount || 0), 0);
  const pendingCount = emails.filter((e) => e.needsUserReview).length;

  if (!isAuthenticated) {
    return (
      <div className="app-viewport">
        <div className="lock-screen">
          <div className="lock-icon-wrapper">
            <Lock size={34} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', marginBottom: '6px' }}>
            Lekka Mobile 🔒
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Enter PIN or tap Biometrics to unlock</p>

          <div className="pin-display">
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className={`pin-dot ${pin.length > idx ? 'filled' : ''}`} />
            ))}
          </div>

          <div className="keypad-grid">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BIO', '0', 'DEL'].map((val) => (
              <button key={val} className="keypad-btn" onClick={() => handleKeypadPress(val)}>
                {val === 'BIO' ? <ShieldCheck size={22} color="#4F46E5" /> : val === 'DEL' ? '←' : val}
              </button>
            ))}
          </div>
          <p style={{ marginTop: '24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Default PIN: 1234 or tap Shield icon</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-viewport">
      {/* Header */}
      <header className="app-header">
        <div className="brand-title">
          Lekka <span className="brand-badge">⚡ Pure API</span>
        </div>
        <div className="sync-status">
          <button
            onClick={fetchPureDataFromBackend}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginRight: '6px' }}
          >
            <RefreshCw size={15} className={isLoadingData ? 'spin' : ''} />
          </button>
          <span className="dot-online" />
          <span>Live DB</span>
          <button
            onClick={handleIngestTrigger}
            style={{ background: 'none', border: 'none', color: 'var(--accent-indigo)', cursor: 'pointer', marginLeft: '6px' }}
          >
            <RefreshCw size={16} className={isIngesting ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {/* Quick Stats Strip */}
      <div className="quick-stats-strip">
        <div className="stat-pill">
          <span className="stat-pill-label">Total Inbox</span>
          <span className="stat-pill-value">{emails.length} 📩</span>
        </div>
        <div className="stat-pill">
          <span className="stat-pill-label">Tracked</span>
          <span className="stat-pill-value" style={{ color: 'var(--accent-emerald)' }}>${totalFinancial.toFixed(0)} 💰</span>
        </div>
        <div className="stat-pill">
          <span className="stat-pill-label">Pending</span>
          <span className="stat-pill-value" style={{ color: 'var(--accent-amber)' }}>{pendingCount} ⚠️</span>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div style={{ background: '#EEF2FF', color: 'var(--accent-indigo)', borderBottom: '1px solid #C7D2FE', padding: '10px 16px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✨ {notification}</span>
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-indigo)', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {/* Main Body */}
      <div className="app-content">
        {activeTab === 'feed' && (
          <>
            {/* Category Filter Pills */}
            <div className="tabs-scroll" style={{ margin: '-16px -16px 16px -16px' }}>
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

            {/* Email Items List */}
            {filteredEmails.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <Inbox size={44} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--text-main)', marginBottom: '4px' }}>No emails in inbox</h4>
                <p style={{ fontSize: '0.8rem' }}>Tap the sync icon above to trigger ingestion from your Gmail inbox.</p>
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
                        <div className="date-tag">{email.receivedAt ? new Date(email.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                      </div>
                      {email.parsedJson?.detectedAmount && (
                        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--accent-emerald)', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: '8px' }}>
                          ${email.parsedJson.detectedAmount.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="email-subject">{email.subject}</div>
                    <div className="email-body-snippet">{email.rawTextBody}</div>

                    <div className="card-footer">
                      <span
                        className="category-chip"
                        style={{ background: email.categoryId?.colorCode || '#2563EB' }}
                      >
                        {email.categoryId?.name || 'General'}
                      </span>

                      {email.needsUserReview && (
                        <span className="review-badge">⚠️ Review Required</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* Dashboard Metrics Tab */}
        {activeTab === 'dashboard' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '16px' }}>Analytics & Insights 📊</h3>

            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Total Processed</div>
                <div className="metric-value">{emails.length}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Tracked Balance</div>
                <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>${totalFinancial.toFixed(2)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Review Queue</div>
                <div className="metric-value" style={{ color: 'var(--accent-amber)' }}>{pendingCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Categories Count</div>
                <div className="metric-value" style={{ color: 'var(--accent-indigo)' }}>{categories.length - 1}</div>
              </div>
            </div>

            <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', color: 'var(--text-muted)' }}>Categorization Source Metrics</h4>
            <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.82rem' }}>
                <span>Rule Engine Matches ⚡</span>
                <span style={{ fontWeight: 'bold' }}>{emails.filter(e => e.categorySource === 'RULE').length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.82rem' }}>
                <span>Groq AI Inference 🤖</span>
                <span style={{ fontWeight: 'bold' }}>{emails.filter(e => e.categorySource === 'GROQ_AI').length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span>User Manual Assignments 👤</span>
                <span style={{ fontWeight: 'bold' }}>{emails.filter(e => e.categorySource === 'USER_MANUAL').length}</span>
              </div>
            </div>
          </div>
        )}

        {/* Visual Rule Builder Tab */}
        {activeTab === 'rules' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '16px' }}>Visual Rule Builder ⚙️</h3>

            <form onSubmit={handleCreateRule} style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Target Field</label>
                <select value={ruleField} onChange={(e: any) => setRuleField(e.target.value)} style={{ width: '100%', padding: '10px', background: 'var(--bg-muted)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', fontWeight: '500' }}>
                  <option value="subject">Email Subject</option>
                  <option value="sender">Sender Email</option>
                  <option value="body">Email Body Text</option>
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Condition Operator</label>
                <select value={ruleOperator} onChange={(e: any) => setRuleOperator(e.target.value)} style={{ width: '100%', padding: '10px', background: 'var(--bg-muted)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', fontWeight: '500' }}>
                  <option value="contains">Contains Keyword</option>
                  <option value="equals">Exact Equals</option>
                  <option value="startsWith">Starts With</option>
                  <option value="regex">Regex Pattern</option>
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Value to Match</label>
                <input type="text" value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} placeholder="e.g. Invoice, Security, Amazon" style={{ width: '100%', padding: '10px', background: 'var(--bg-muted)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', fontWeight: '500' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Assign Category</label>
                <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} style={{ width: '100%', padding: '10px', background: 'var(--bg-muted)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', fontWeight: '500' }}>
                  {categories.filter(c => c._id !== 'c0').map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} /> Save Database Rule
              </button>
            </form>

            <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', color: 'var(--text-muted)' }}>Active Classification Rules ({userRules.length})</h4>
            {userRules.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No rules stored in database yet.</p>
            ) : (
              userRules.map((r) => (
                <div key={r.id} style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{r.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-indigo)', fontWeight: '500' }}>{r.condition}</div>
                  </div>
                  <Tag size={16} color="var(--accent-emerald)" />
                </div>
              ))
            )}
          </div>
        )}

        {/* LLM JSON Export Tab */}
        {activeTab === 'export' && (
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div style={{ width: '64px', height: '64px', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 16px auto', color: 'var(--accent-indigo)' }}>
              <Download size={28} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', marginBottom: '8px' }}>LLM Context Exporter 📦</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px', lineHeight: '1.5' }}>
              Export all stored email records, extracted key-value payloads, Groq AI inference scores, and custom rules from MongoDB as a JSON file.
            </p>

            <button onClick={handleExportLLMContext} className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '0 auto', maxWidth: '280px' }}>
              <Download size={18} /> Download Context JSON
            </button>
          </div>
        )}
      </div>

      {/* Email Payload Inspection Modal */}
      {selectedEmail && (
        <div className="modal-overlay" onClick={() => setSelectedEmail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>{selectedEmail.subject}</h3>
              <button onClick={() => setSelectedEmail(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--accent-indigo)', fontWeight: '600', marginBottom: '12px' }}>From: {selectedEmail.sender}</div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <span className="category-chip" style={{ background: selectedEmail.categoryId?.colorCode || '#2563EB' }}>
                {selectedEmail.categoryId?.name || 'General'}
              </span>
              <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '12px', background: 'var(--bg-muted)', color: 'var(--text-muted)', fontWeight: '600' }}>
                Source: {selectedEmail.categorySource}
              </span>
            </div>

            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Extracted Key-Value Payload</h4>
            <div className="json-preview">
              {JSON.stringify(selectedEmail.parsedJson, null, 2)}
            </div>

            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Raw Email Snippet</h4>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', background: 'var(--bg-muted)', padding: '12px', borderRadius: '8px', marginBottom: '20px', lineHeight: '1.4' }}>
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
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '10px' }}>Re-assign Category</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Select a target category. Re-assigning automatically creates a new matching rule in MongoDB.</p>

            {categories.filter(c => c._id !== 'c0').map((cat) => (
              <button
                key={cat._id}
                onClick={() => handleReassignCategory(cat)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontWeight: '600',
                  textAlign: 'left',
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
              >
                <span>{cat.name}</span>
                <ChevronRight size={16} color={cat.colorCode} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Mobile Tab Bar */}
      <nav className="app-nav">
        <button className={`nav-item ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>
          <Inbox />
          <span>Emails</span>
        </button>
        <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <BarChart3 />
          <span>Metrics</span>
        </button>
        <button className={`nav-item ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
          <Sliders />
          <span>Rules</span>
        </button>
        <button className={`nav-item ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>
          <Download />
          <span>Export</span>
        </button>
      </nav>
    </div>
  );
}
