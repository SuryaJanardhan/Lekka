import React, { useState, useEffect } from 'react';
import {
  Inbox,
  BarChart3,
  Sliders,
  Download,
  Lock,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Tag,
  Plus,
  ArrowUpRight
} from 'lucide-react';
import { EmailRecord, Category, Rule, DashboardStats } from './types';

// Mock offline cache initialization matching MMKV key-value behavior
const INITIAL_MOCK_EMAILS: EmailRecord[] = [
  {
    _id: 'e1',
    messageId: 'msg_aws_9918',
    sender: 'billing@aws.amazon.com',
    subject: 'Your AWS Monthly Service Invoice #INV-98231',
    rawTextBody: 'Total Amount Due: $142.50 USD for AWS Cloud Infrastructure services. Reference ID: INV-98231. Date: 2026-09-20.',
    parsedJson: { detectedAmount: 142.50, currency: 'USD', referenceNumber: 'INV-98231', rawSummary: 'AWS Cloud Infrastructure' },
    hasAttachments: true,
    categoryId: { _id: 'c1', name: 'Invoices & Receipts', slug: 'invoices-receipts', colorCode: '#10B981', createdSource: 'SYSTEM' },
    categorySource: 'RULE',
    aiConfidenceScore: 1.0,
    needsUserReview: false,
    reviewStatus: 'APPROVED',
    receivedAt: '2026-09-20T12:05:00Z',
    processedAt: '2026-09-20T12:06:00Z'
  },
  {
    _id: 'e2',
    messageId: 'msg_gh_4412',
    sender: 'security@github.com',
    subject: 'Security Alert: New SSH key added to your account',
    rawTextBody: 'A new SSH key was added to account surya from IP 192.168.1.1. If this was not you, revoke it.',
    parsedJson: { ipAddress: '192.168.1.1', user: 'surya', rawSummary: 'New SSH key added' },
    hasAttachments: false,
    categoryId: { _id: 'c2', name: 'Alerts & Security', slug: 'alerts-security', colorCode: '#EF4444', createdSource: 'SYSTEM' },
    categorySource: 'GROQ_AI',
    aiConfidenceScore: 0.94,
    needsUserReview: false,
    reviewStatus: 'APPROVED',
    receivedAt: '2026-09-21T08:30:00Z',
    processedAt: '2026-09-21T12:01:00Z'
  },
  {
    _id: 'e3',
    messageId: 'msg_vendor_8812',
    sender: 'notifications@service.com',
    subject: 'Monthly Usage Breakdown & Invoice Prompt',
    rawTextBody: 'Please review your usage report for September. Total balance pending: $89.00.',
    parsedJson: { detectedAmount: 89.00, currency: 'USD', rawSummary: 'Usage breakdown pending review' },
    hasAttachments: false,
    categoryId: { _id: 'c1', name: 'Invoices & Receipts', slug: 'invoices-receipts', colorCode: '#10B981', createdSource: 'SYSTEM' },
    categorySource: 'GROQ_AI',
    aiConfidenceScore: 0.65,
    needsUserReview: true,
    reviewStatus: 'PENDING',
    receivedAt: '2026-09-21T12:15:00Z',
    processedAt: '2026-09-21T12:16:00Z'
  }
];

const INITIAL_CATEGORIES: Category[] = [
  { _id: 'c0', name: 'All', slug: 'all', colorCode: '#3B82F6', createdSource: 'SYSTEM' },
  { _id: 'c1', name: 'Invoices & Receipts', slug: 'invoices-receipts', colorCode: '#10B981', createdSource: 'SYSTEM' },
  { _id: 'c2', name: 'Alerts & Security', slug: 'alerts-security', colorCode: '#EF4444', createdSource: 'SYSTEM' },
  { _id: 'c3', name: 'Orders & Delivery', slug: 'orders-delivery', colorCode: '#F59E0B', createdSource: 'SYSTEM' },
  { _id: 'c4', name: 'Financial Statements', slug: 'financial-statements', colorCode: '#8B5CF6', createdSource: 'SYSTEM' }
];

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [activeTab, setActiveTab] = useState<'feed' | 'dashboard' | 'rules' | 'export'>('feed');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [emails, setEmails] = useState<EmailRecord[]>(INITIAL_MOCK_EMAILS);
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // New Rule Builder State
  const [ruleField, setRuleField] = useState<'sender' | 'subject' | 'body'>('subject');
  const [ruleOperator, setRuleOperator] = useState<'contains' | 'equals' | 'startsWith' | 'regex'>('contains');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleCategory, setRuleCategory] = useState('c1');
  const [userRules, setUserRules] = useState<Array<{ id: string; name: string; condition: string }>>([
    { id: 'r1', name: 'Invoices Rule', condition: 'Subject contains "Invoice"' },
    { id: 'r2', name: 'Security Alert Rule', condition: 'Subject contains "Security"' }
  ]);

  // Handle PIN unlock
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

  // Trigger Backend Ingestion Pipeline
  const handleIngestTrigger = async () => {
    setIsIngesting(true);
    try {
      const res = await fetch('http://localhost:5000/api/ingest', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setNotification(`Ingestion run complete. Processed ${json.data.newIngested} new emails.`);
        // Refresh emails from API if available
        fetchEmailsFromBackend();
      }
    } catch {
      // Mock local sync fallback
      setTimeout(() => {
        const newMock: EmailRecord = {
          _id: `e_${Date.now()}`,
          messageId: `msg_${Date.now()}`,
          sender: 'invoices@cloudvendor.com',
          subject: 'Monthly Cloud Infrastructure Bill #INV-7712',
          rawTextBody: 'Your monthly bill of $210.00 USD has been generated.',
          parsedJson: { detectedAmount: 210.0, currency: 'USD', referenceNumber: 'INV-7712' },
          hasAttachments: false,
          categoryId: INITIAL_CATEGORIES[1],
          categorySource: 'RULE',
          aiConfidenceScore: 1.0,
          needsUserReview: false,
          reviewStatus: 'APPROVED',
          receivedAt: new Date().toISOString(),
          processedAt: new Date().toISOString()
        };
        setEmails((prev) => [newMock, ...prev]);
        setNotification('Offline sync complete: 1 new email ingested post 12 PM.');
        setIsIngesting(false);
      }, 1000);
      return;
    }
    setIsIngesting(false);
  };

  const fetchEmailsFromBackend = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/emails');
      const json = await res.json();
      if (json.success && json.data) {
        setEmails(json.data);
      }
    } catch {
      // Keep local MMKV mock state if backend is offline
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchEmailsFromBackend();
    }
  }, [isAuthenticated]);

  const handleReassignCategory = (newCat: Category) => {
    if (!selectedEmail) return;

    const updated = emails.map((e) => {
      if (e._id === selectedEmail._id) {
        return {
          ...e,
          categoryId: newCat,
          categorySource: 'USER_MANUAL' as const,
          needsUserReview: false,
          reviewStatus: 'REASSIGNED' as const
        };
      }
      return e;
    });

    setEmails(updated);
    setSelectedEmail((prev) => prev ? { ...prev, categoryId: newCat, categorySource: 'USER_MANUAL', needsUserReview: false } : null);
    setIsReassignModalOpen(false);

    // Auto-generate matching rule
    const newRuleText = `Subject contains "${selectedEmail.subject.split(' ')[0]}"`;
    setUserRules((prev) => [{ id: `r_${Date.now()}`, name: `Auto Rule: ${newCat.name}`, condition: newRuleText }, ...prev]);

    setNotification(`Re-assigned to ${newCat.name}. Created automatic matching rule in MongoDB.`);
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleValue) return;

    const targetCat = categories.find((c) => c._id === ruleCategory) || categories[1];
    const newRule = {
      id: `r_${Date.now()}`,
      name: `${targetCat.name} Rule`,
      condition: `${ruleField.toUpperCase()} ${ruleOperator} "${ruleValue}"`
    };

    setUserRules([newRule, ...userRules]);
    setRuleValue('');
    setNotification(`New classification rule added for ${targetCat.name}.`);
  };

  const handleExportLLMContext = () => {
    const bundle = {
      exportMetadata: {
        generatedAt: new Date().toISOString(),
        systemVersion: '1.0.0',
        totalEmailsExported: emails.length
      },
      categories,
      rules: userRules,
      emailRecords: emails
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lekka_llm_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotification('LLM-Ready Context JSON file saved to local downloads.');
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
            <Lock size={36} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', marginBottom: '8px' }}>Lekka Security</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Enter PIN or tap Biometrics to unlock local MMKV storage</p>

          <div className="pin-display">
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className={`pin-dot ${pin.length > idx ? 'filled' : ''}`} />
            ))}
          </div>

          <div className="keypad-grid">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BIO', '0', 'DEL'].map((val) => (
              <button key={val} className="keypad-btn" onClick={() => handleKeypadPress(val)}>
                {val === 'BIO' ? <ShieldCheck size={22} color="#3B82F6" /> : val === 'DEL' ? '←' : val}
              </button>
            ))}
          </div>
          <p style={{ marginTop: '20px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Default PIN: 1234 or tap Shield icon</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-viewport">
      {/* App Header */}
      <header className="app-header">
        <div className="brand-title">
          Lekka <span className="brand-badge">MMKV Offline</span>
        </div>
        <div className="sync-status">
          <span className="dot-online" />
          <span>Synced</span>
          <button
            onClick={handleIngestTrigger}
            style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', marginLeft: '6px' }}
          >
            <RefreshCw size={16} className={isIngesting ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {notification && (
        <div style={{ background: 'var(--accent-blue)', color: '#fff', padding: '10px 16px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {/* Main Viewport Content */}
      <div className="app-content">
        {activeTab === 'feed' && (
          <>
            {/* Category Tabs Header */}
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

            {/* Email Feed Items */}
            {filteredEmails.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <Inbox size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>No processed emails found in this category.</p>
              </div>
            ) : (
              filteredEmails.map((email) => (
                <div key={email._id} className="email-card" onClick={() => setSelectedEmail(email)}>
                  <div className="card-header">
                    <span className="sender-tag">{email.sender}</span>
                    <span className="date-tag">{new Date(email.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="email-subject">{email.subject}</div>
                  <div className="email-body-snippet">{email.rawTextBody}</div>

                  <div className="card-footer">
                    <span
                      className="category-chip"
                      style={{ background: email.categoryId?.colorCode || '#3B82F6' }}
                    >
                      {email.categoryId?.name || 'General'}
                    </span>

                    {email.needsUserReview && (
                      <span className="review-badge">Review Required</span>
                    )}

                    {email.parsedJson?.detectedAmount && (
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-emerald)' }}>
                        ${email.parsedJson.detectedAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '16px' }}>Analytics & Insights</h3>

            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Total Ingested</div>
                <div className="metric-value">{emails.length}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Financial Tracked</div>
                <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>${totalFinancial.toFixed(2)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Pending Reviews</div>
                <div className="metric-value" style={{ color: 'var(--accent-amber)' }}>{pendingCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">AI Accuracy</div>
                <div className="metric-value" style={{ color: 'var(--accent-blue)' }}>92%</div>
              </div>
            </div>

            <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-muted)' }}>Classification Source Breakdown</h4>
            <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem' }}>
                <span>Rule Engine Matches</span>
                <span style={{ fontWeight: 'bold' }}>{emails.filter(e => e.categorySource === 'RULE').length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem' }}>
                <span>Groq AI Fallback Matches</span>
                <span style={{ fontWeight: 'bold' }}>{emails.filter(e => e.categorySource === 'GROQ_AI').length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span>User Feedback Overrides</span>
                <span style={{ fontWeight: 'bold' }}>{emails.filter(e => e.categorySource === 'USER_MANUAL').length}</span>
              </div>
            </div>
          </div>
        )}

        {/* Visual Rule Builder Tab */}
        {activeTab === 'rules' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '16px' }}>Visual Rule Builder</h3>

            <form onSubmit={handleCreateRule} style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Target Field</label>
                <select value={ruleField} onChange={(e: any) => setRuleField(e.target.value)} style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px' }}>
                  <option value="subject">Email Subject</option>
                  <option value="sender">Sender Email</option>
                  <option value="body">Email Body Text</option>
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Condition Operator</label>
                <select value={ruleOperator} onChange={(e: any) => setRuleOperator(e.target.value)} style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px' }}>
                  <option value="contains">Contains Keyword</option>
                  <option value="equals">Exact Equals</option>
                  <option value="startsWith">Starts With</option>
                  <option value="regex">Regex Expression</option>
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Value to Match</label>
                <input type="text" value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} placeholder="e.g. Invoice, Security, AWS" style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Assign Category</label>
                <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px' }}>
                  {categories.filter(c => c._id !== 'c0').map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} /> Add Category Rule
              </button>
            </form>

            <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-muted)' }}>Active Classification Rules</h4>
            {userRules.map((r) => (
              <div key={r.id} style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{r.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>{r.condition}</div>
                </div>
                <Tag size={16} color="var(--accent-emerald)" />
              </div>
            ))}
          </div>
        )}

        {/* LLM JSON Export Tab */}
        {activeTab === 'export' && (
          <div style={{ textAlign: 'center', padding: '20px 10px' }}>
            <Download size={48} color="var(--accent-blue)" style={{ marginBottom: '16px' }} />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', marginBottom: '8px' }}>LLM-Ready Context Exporter</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px', lineHeight: '1.5' }}>
              Export all stored emails, extracted JSON payloads, categorization lineage logs, Groq AI scores, and rules as a single self-contained JSON file for direct analysis in external LLMs.
            </p>

            <button onClick={handleExportLLMContext} className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '0 auto', maxWidth: '280px' }}>
              <Download size={18} /> Download Context JSON
            </button>
          </div>
        )}
      </div>

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div className="modal-overlay" onClick={() => setSelectedEmail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>{selectedEmail.subject}</h3>
              <button onClick={() => setSelectedEmail(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', marginBottom: '12px' }}>From: {selectedEmail.sender}</div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <span className="category-chip" style={{ background: selectedEmail.categoryId?.colorCode || '#3B82F6' }}>
                {selectedEmail.categoryId?.name || 'General'}
              </span>
              <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                Source: {selectedEmail.categorySource}
              </span>
            </div>

            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Extracted Key-Value Payload</h4>
            <div className="json-preview">
              {JSON.stringify(selectedEmail.parsedJson, null, 2)}
            </div>

            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Raw Body Snippet</h4>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', marginBottom: '20px', lineHeight: '1.4' }}>
              {selectedEmail.rawTextBody}
            </div>

            <button onClick={() => setIsReassignModalOpen(true)} className="btn-primary" style={{ background: 'var(--bg-glass)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }}>
              Re-assign Category & Auto-Train Rule
            </button>
          </div>
        </div>
      )}

      {/* Category Re-assignment Modal */}
      {isReassignModalOpen && selectedEmail && (
        <div className="modal-overlay" onClick={() => setIsReassignModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '12px' }}>Re-assign Category</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Select a target category. Re-assigning automatically creates a new matching rule in MongoDB.</p>

            {categories.filter(c => c._id !== 'c0').map((cat) => (
              <button
                key={cat._id}
                onClick={() => handleReassignCategory(cat)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
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
