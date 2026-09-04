// src/pages/Exceptions.tsx
import { useEffect, useState, useMemo } from 'react';
import { fetchExceptions, escalateException, sendFollowup, recordFollowupReply, previewFollowup } from '../api';
import type { ExceptionRecord } from '../types';
import './Exceptions.css';

type SortField = 'id' | 'record_id' | 'record_type' | 'status' | 'confidence' | 'resolved_by_tier' | 'created_at' | 'escalated_at' | 'followup_sent_at';
type SortDirection = 'asc' | 'desc';

export default function Exceptions() {
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedException, setSelectedException] = useState<ExceptionRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [escalating, setEscalating] = useState<number | null>(null);
  const [escalationResult, setEscalationResult] = useState<{
    exceptionId: number;
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  
  // Follow-up states
  const [followupSending, setFollowupSending] = useState<number | null>(null);
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [followupMessage, setFollowupMessage] = useState('');
  const [followupExceptionId, setFollowupExceptionId] = useState<number | null>(null);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyExceptionId, setReplyExceptionId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState('confirmed_paid');
  
  // Email preview states
  const [emailPreview, setEmailPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const load = () => {
    setLoading(true);
    fetchExceptions(filter || undefined)
      .then(res => setExceptions(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  // Sorting and filtering logic
  const sortedAndFilteredExceptions = useMemo(() => {
    let result = [...exceptions];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(ex => 
        ex.record_id.toLowerCase().includes(term) ||
        ex.record_type.toLowerCase().includes(term) ||
        ex.status.toLowerCase().includes(term) ||
        (ex.recommended_action && ex.recommended_action.toLowerCase().includes(term)) ||
        (ex.payment_id && ex.payment_id.toLowerCase().includes(term))
      );
    }

    result.sort((a, b) => {
      let aVal: any = a[sortField as keyof ExceptionRecord];
      let bVal: any = b[sortField as keyof ExceptionRecord];

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (sortField === 'created_at' || sortField === 'escalated_at' || sortField === 'followup_sent_at') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (sortField === 'confidence') {
        aVal = aVal || 0;
        bVal = bVal || 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [exceptions, sortField, sortDirection, searchTerm]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleEscalate = async (id: number) => {
    const channels = window.confirm(
      'Send escalation via email and WhatsApp?\n\n' +
      'Click OK for both channels (Email + WhatsApp)\n' +
      'Click Cancel for Email only'
    );

    const channelList = channels ? ['email', 'whatsapp'] : ['email'];
    
    setEscalating(id);
    setEscalationResult(null);

    try {
      const response = await escalateException(id, { channels: channelList });
      
      setEscalationResult({
        exceptionId: id,
        success: true,
        message: `Escalation sent successfully via ${channelList.join(' & ')}`,
        details: response.data
      });

      await load();
      alert(`✅ Escalation successful!\n\nSent via: ${channelList.join(' & ')}\nTo: ${response.data.recipient || 'Configured team'}`);
      
    } catch (error: any) {
      console.error('Escalation failed:', error);
      
      setEscalationResult({
        exceptionId: id,
        success: false,
        message: error.response?.data?.error || 'Failed to send escalation',
        details: error.response?.data
      });

      alert(`❌ Escalation failed:\n\n${error.response?.data?.error || error.message}`);
    } finally {
      setEscalating(null);
    }
  };

  // Generate email preview
  const handlePreviewEmail = async (id: number) => {
    setLoadingPreview(true);
    setShowEmailPreview(true);
    setEmailPreview(null);
    
    try {
      const response = await previewFollowup(id, followupMessage || undefined);
      setEmailPreview(response.data.email_preview || response.data.email_body);
    } catch (error: any) {
      alert(`❌ Failed to generate preview: ${error.response?.data?.error || error.message}`);
      setShowEmailPreview(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Follow-up handlers
  const handleSendFollowup = async (id: number) => {
    setFollowupSending(id);
    try {
      const response = await sendFollowup(id, followupMessage);
      alert(`✅ Follow-up email sent to ${response.data.party.email}`);
      await load();
    } catch (error: any) {
      alert(`❌ Failed to send follow-up: ${error.response?.data?.error || error.message}`);
    } finally {
      setFollowupSending(null);
      setShowFollowupModal(false);
      setFollowupMessage('');
      setFollowupExceptionId(null);
      setShowEmailPreview(false);
      setEmailPreview(null);
    }
  };

  const handleRecordReply = async (id: number) => {
    if (!replyText.trim()) {
      alert('Please enter a reply message');
      return;
    }
    try {
      await recordFollowupReply(id, replyText, replyStatus);
      alert('✅ Reply recorded successfully!');
      await load();
      setShowReplyModal(false);
      setReplyText('');
      setReplyExceptionId(null);
    } catch (error: any) {
      alert(`❌ Failed to record reply: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleViewDetails = (exception: ExceptionRecord) => {
    setSelectedException(exception);
    setShowDetailModal(true);
  };

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      matched: 'status-badge matched',
      partial_payment: 'status-badge partial',
      pending: 'status-badge pending',
      overdue: 'status-badge overdue',
      exception: 'status-badge exception'
    };
    return classes[status] || 'status-badge';
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      matched: '✅',
      partial_payment: '📊',
      pending: '⏳',
      overdue: '⚠️',
      exception: '🚨'
    };
    return icons[status] || '📌';
  };

  const getTierBadge = (tier: string) => {
    const classes: Record<string, string> = {
      rule: 'tier-badge rule',
      groq: 'tier-badge groq',
      claude: 'tier-badge claude'
    };
    return classes[tier] || 'tier-badge';
  };

  const getTierIcon = (tier: string) => {
    const icons: Record<string, string> = {
      rule: '⚡',
      groq: '🤖',
      claude: '🧠'
    };
    return icons[tier] || '📌';
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // Summary statistics
  const stats = {
    total: exceptions.length,
    overdue: exceptions.filter(e => e.status === 'overdue').length,
    pending: exceptions.filter(e => e.status === 'pending').length,
    partial: exceptions.filter(e => e.status === 'partial_payment').length,
    exception: exceptions.filter(e => e.status === 'exception').length,
    matched: exceptions.filter(e => e.status === 'matched').length
  };

  return (
    <div className="exceptions-container">
      {/* Header */}
      <div className="page-header">
        <div className="header-top">
          <div>
            <h1>Exceptions & Audit Trail</h1>
            <p>View and manage all reconciliation exceptions</p>
          </div>
          <div className="header-actions">
            <button onClick={load} className="btn-refresh">
              🔄 Refresh
            </button>
            <button className="btn-export">📥 Export</button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="summary-stats">
          <span className="stats-label">Summary:</span>
          <div className="stat-item">
            <span className="stat-dot overdue"></span>
            <span className="stat-number overdue">{stats.overdue}</span>
            <span className="stat-label">Overdue</span>
          </div>
          <div className="stat-item">
            <span className="stat-dot partial"></span>
            <span className="stat-number partial">{stats.partial}</span>
            <span className="stat-label">Partial</span>
          </div>
          <div className="stat-item">
            <span className="stat-dot pending"></span>
            <span className="stat-number pending">{stats.pending}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-item">
            <span className="stat-dot exception"></span>
            <span className="stat-number exception">{stats.exception}</span>
            <span className="stat-label">Exception</span>
          </div>
          <div className="stat-item">
            <span className="stat-dot matched"></span>
            <span className="stat-number matched">{stats.matched}</span>
            <span className="stat-label">Matched</span>
          </div>
          <div className="stat-total">
            Total: <strong>{stats.total}</strong>
          </div>
        </div>
      </div>

      <div className="card">
        {/* Filters */}
        <div className="filter-bar">
          <div className="filter-group">
            <label>Status:</label>
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)} 
              className="filter-select"
            >
              <option value="">All Statuses</option>
              <option value="matched">✅ Matched</option>
              <option value="partial_payment">📊 Partial</option>
              <option value="pending">⏳ Pending</option>
              <option value="overdue">⚠️ Overdue</option>
              <option value="exception">🚨 Exception</option>
            </select>
          </div>

          <div className="filter-group search-group">
            <input
              type="text"
              placeholder="Search by ID, type, status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-actions">
            <span className="records-count">
              Showing <strong>{sortedAndFilteredExceptions.length}</strong> of <strong>{exceptions.length}</strong>
            </span>
          </div>
        </div>

        {/* Escalation Result Toast */}
        {escalationResult && (
          <div className={`toast ${escalationResult.success ? 'toast-success' : 'toast-error'}`}>
            <div className="toast-content">
              <span>{escalationResult.success ? '✅' : '❌'}</span>
              <span className="toast-message">{escalationResult.message}</span>
              <button onClick={() => setEscalationResult(null)} className="toast-close">✕</button>
            </div>
            {escalationResult.details && (
              <details className="toast-details">
                <summary>View details</summary>
                <pre>{JSON.stringify(escalationResult.details, null, 2)}</pre>
              </details>
            )}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="loading-state">
            <div className="loading-content">
              <div className="loading-icon">⏳</div>
              <p className="loading-text">Loading exceptions...</p>
              <p className="loading-subtext">Please wait</p>
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="exceptions-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('id')} className="sortable">
                    # {getSortIcon('id')}
                  </th>
                  <th onClick={() => handleSort('record_id')} className="sortable">
                    Record ID {getSortIcon('record_id')}
                  </th>
                  <th onClick={() => handleSort('record_type')} className="sortable">
                    Type {getSortIcon('record_type')}
                  </th>
                  <th onClick={() => handleSort('status')} className="sortable">
                    Status {getSortIcon('status')}
                  </th>
                  <th onClick={() => handleSort('confidence')} className="sortable">
                    Confidence {getSortIcon('confidence')}
                  </th>
                  <th onClick={() => handleSort('resolved_by_tier')} className="sortable">
                    Tier {getSortIcon('resolved_by_tier')}
                  </th>
                  <th>Recommended Action</th>
                  <th onClick={() => handleSort('created_at')} className="sortable">
                    Created {getSortIcon('created_at')}
                  </th>
                  <th onClick={() => handleSort('followup_sent_at')} className="sortable">
                    Follow-up {getSortIcon('followup_sent_at')}
                  </th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredExceptions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="empty-state">
                      <div className="empty-icon">📭</div>
                      <p className="empty-title">No exceptions found</p>
                      <p className="empty-subtitle">Try adjusting your filters or refresh the page</p>
                    </td>
                  </tr>
                ) : (
                  sortedAndFilteredExceptions.map(ex => (
                    <tr key={ex.id} className="table-row">
                      <td className="id-cell">#{ex.id}</td>
                      <td className="record-id-cell">
                        <span className="record-id-text">{ex.record_id}</span>
                        {ex.payment_id && (
                          <span className="payment-id-tag">💰 {ex.payment_id}</span>
                        )}
                      </td>
                      <td>
                        <span className={`type-badge ${ex.record_type === 'sales' ? 'sales' : 'purchases'}`}>
                          {ex.record_type === 'sales' ? '💳' : '📦'} {ex.record_type}
                        </span>
                      </td>
                      <td>
                        <span className={getStatusBadge(ex.status)}>
                          {getStatusIcon(ex.status)} {ex.status.replace('_', ' ')}
                        </span>
                        {ex.followup_status === 'awaiting_reply' && (
                          <span className="followup-badge awaiting">⏳ Awaiting Reply</span>
                        )}
                        {ex.followup_status === 'replied' && (
                          <span className="followup-badge replied">✅ Replied</span>
                        )}
                        {ex.followup_status === 'promised_payment' && (
                          <span className="followup-badge promised">📅 Promised</span>
                        )}
                      </td>
                      <td>
                        <div className="confidence-cell">
                          <span className="confidence-value">{ex.confidence ?? 'N/A'}%</span>
                          {ex.confidence && (
                            <div className="confidence-bar-wrapper">
                              <div className="confidence-bar">
                                <div 
                                  className={`confidence-bar-fill ${
                                    ex.confidence >= 90 ? 'high' :
                                    ex.confidence >= 70 ? 'medium' : 'low'
                                  }`}
                                  style={{ width: `${ex.confidence}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={getTierBadge(ex.resolved_by_tier)}>
                          {getTierIcon(ex.resolved_by_tier)} {ex.resolved_by_tier}
                        </span>
                      </td>
                      <td>
                        <div className="action-text" title={ex.recommended_action || '-'}>
                          {ex.recommended_action || <span className="placeholder">-</span>}
                        </div>
                      </td>
                      <td>{formatDate(ex.created_at)}</td>
                      <td>
                        {ex.followup_sent_at ? (
                          <div className="followup-info">
                            <span className="followup-dot"></span>
                            {formatDate(ex.followup_sent_at)}
                            {ex.followup_sent_to && (
                              <span className="followup-to">→ {ex.followup_sent_to}</span>
                            )}
                            {ex.followup_reply && (
                              <span className="followup-reply" title={ex.followup_reply}>
                                💬 {ex.followup_reply.length > 30 
                                  ? ex.followup_reply.substring(0, 30) + '...' 
                                  : ex.followup_reply}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="not-followed-up">—</span>
                        )}
                      </td>
                      <td className="action-cell">
                        <button
                          onClick={() => handleViewDetails(ex)}
                          className="btn-icon"
                          title="View details"
                          disabled={escalating === ex.id || followupSending === ex.id}
                        >
                          👁️
                        </button>

                        {/* Follow-up button for non-matched statuses */}
                        {['partial_payment', 'pending', 'overdue', 'exception'].includes(ex.status) && (
                          <button
                            onClick={() => {
                              setFollowupExceptionId(ex.id);
                              setShowFollowupModal(true);
                            }}
                            className="btn-followup"
                            disabled={followupSending === ex.id}
                            title="Send follow-up email to customer"
                          >
                            📧
                          </button>
                        )}

                        {/* Record Reply button if follow-up was sent */}
                        {ex.followup_status === 'awaiting_reply' && (
                          <button
                            onClick={() => {
                              setReplyExceptionId(ex.id);
                              setShowReplyModal(true);
                            }}
                            className="btn-reply"
                            title="Record customer reply"
                          >
                            💬 Reply
                          </button>
                        )}

                        {ex.status === 'matched' && (
                          <span className="btn-complete">✓ Complete</span>
                        )}

                        {ex.status === 'partial_payment' && (
                          <button
                            onClick={() => handleViewDetails(ex)}
                            className="btn-followup"
                            disabled={escalating === ex.id || followupSending === ex.id}
                          >
                            📊 Follow Up
                          </button>
                        )}

                        {['pending', 'overdue', 'exception'].includes(ex.status) && (
                          <button
                            onClick={() => handleEscalate(ex.id)}
                            disabled={escalating === ex.id}
                            className={`btn-escalate ${
                              ex.status === 'pending' ? 'btn-escalate-orange' :
                              ex.status === 'overdue' ? 'btn-escalate-red' :
                              'btn-escalate-purple'
                            }`}
                          >
                            {escalating === ex.id ? '⏳' : '🚀'} Escalate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && sortedAndFilteredExceptions.length > 0 && (
          <div className="pagination">
            <div className="pagination-info">
              Showing <strong>{Math.min(1, sortedAndFilteredExceptions.length)}</strong> to{' '}
              <strong>{Math.min(10, sortedAndFilteredExceptions.length)}</strong> of{' '}
              <strong>{sortedAndFilteredExceptions.length}</strong> results
            </div>
            <div className="pagination-buttons">
              <button className="btn-page" disabled>Previous</button>
              <button className="btn-page active">1</button>
              <button className="btn-page">2</button>
              <button className="btn-page">3</button>
              <button className="btn-page">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Follow-up Modal with Email Preview */}
      {showFollowupModal && followupExceptionId && (
        <div className="modal-overlay" onClick={() => setShowFollowupModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div className="modal-title">
                <h2>📧 Send Follow-up</h2>
              </div>
              <button onClick={() => {
                setShowFollowupModal(false);
                setShowEmailPreview(false);
                setEmailPreview(null);
              }} className="btn-close">✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Custom Message (Optional)</label>
                <textarea
                  value={followupMessage}
                  onChange={(e) => setFollowupMessage(e.target.value)}
                  placeholder="Add any additional information or questions for the customer..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Email Preview Section */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 500, fontSize: '14px' }}>📄 Email Preview</label>
                  <button
                    onClick={() => handlePreviewEmail(followupExceptionId!)}
                    disabled={loadingPreview}
                    style={{
                      padding: '6px 16px',
                      background: loadingPreview ? '#d1d5db' : '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: loadingPreview ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {loadingPreview ? '⏳ Generating...' : '🤖 Generate Preview'}
                  </button>
                </div>
                
                {loadingPreview && (
                  <div style={{
                    padding: '20px',
                    background: '#f3f4f6',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#6b7280'
                  }}>
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                    {' '}Generating AI-powered email...
                  </div>
                )}

                {emailPreview && !loadingPreview && (
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontSize: '13px',
                    lineHeight: '1.8',
                    fontFamily: 'inherit'
                  }}>
                    {emailPreview}
                  </div>
                )}

                {!emailPreview && !loadingPreview && (
                  <div style={{
                    padding: '20px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    border: '1px dashed #d1d5db'
                  }}>
                    Click "Generate Preview" to see the AI-powered email
                  </div>
                )}
              </div>

              <div style={{ 
                padding: '12px', 
                background: '#f0fdf4', 
                borderRadius: '8px', 
                border: '1px solid #bbf7d0',
                fontSize: '13px',
                color: '#166534'
              }}>
                💡 The email will be sent to the customer with the AI-generated content based on the exception details.
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => {
                  setShowFollowupModal(false);
                  setShowEmailPreview(false);
                  setEmailPreview(null);
                }} 
                className="btn-close-modal"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSendFollowup(followupExceptionId)} 
                className="btn-escalate-modal"
                disabled={followupSending === followupExceptionId}
                style={{ background: '#22c55e' }}
              >
                {followupSending === followupExceptionId ? '⏳ Sending...' : '📧 Send Follow-up'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Reply Modal */}
      {showReplyModal && replyExceptionId && (
        <div className="modal-overlay" onClick={() => setShowReplyModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <div className="modal-title">
                <h2>💬 Record Customer Reply</h2>
              </div>
              <button onClick={() => setShowReplyModal(false)} className="btn-close">✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Reply Status</label>
                <select
                  value={replyStatus}
                  onChange={(e) => setReplyStatus(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  <option value="confirmed_paid">✅ Confirmed - Payment Made</option>
                  <option value="confirmed_unpaid">❌ Confirmed - Not Paid</option>
                  <option value="need_clarification">📝 Need Clarification</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Reply Message</label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Enter the customer's reply message..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowReplyModal(false)} className="btn-close-modal">
                Cancel
              </button>
              <button 
                onClick={() => handleRecordReply(replyExceptionId)} 
                className="btn-escalate-modal"
                style={{ background: '#8b5cf6' }}
              >
                💬 Record Reply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedException && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <h2>Exception Details</h2>
                <span className={getStatusBadge(selectedException.status)}>
                  {getStatusIcon(selectedException.status)} {selectedException.status.replace('_', ' ')}
                </span>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="btn-close">✕</button>
            </div>

            <div className="modal-body">
              {/* Grid Layout */}
              <div className="detail-grid">
                <div className="detail-field">
                  <span className="field-label">ID</span>
                  <span className="field-value mono">#{selectedException.id}</span>
                </div>
                <div className="detail-field">
                  <span className="field-label">Record ID</span>
                  <span className="field-value mono">{selectedException.record_id}</span>
                </div>
                <div className="detail-field">
                  <span className="field-label">Payment ID</span>
                  <span className="field-value mono">{selectedException.payment_id || '—'}</span>
                </div>
                <div className="detail-field">
                  <span className="field-label">Type</span>
                  <span className="field-value capitalize">{selectedException.record_type}</span>
                </div>
                <div className="detail-field">
                  <span className="field-label">Status</span>
                  <span className="field-value">
                    <span className={getStatusBadge(selectedException.status)}>
                      {getStatusIcon(selectedException.status)} {selectedException.status.replace('_', ' ')}
                    </span>
                  </span>
                </div>
                <div className="detail-field">
                  <span className="field-label">Tier</span>
                  <span className="field-value">
                    <span className={getTierBadge(selectedException.resolved_by_tier)}>
                      {getTierIcon(selectedException.resolved_by_tier)} {selectedException.resolved_by_tier}
                    </span>
                  </span>
                </div>
                <div className="detail-field">
                  <span className="field-label">Confidence</span>
                  <span className="field-value">{selectedException.confidence ?? 'N/A'}%</span>
                </div>
                <div className="detail-field">
                  <span className="field-label">Created</span>
                  <span className="field-value">{formatDate(selectedException.created_at)}</span>
                </div>
              </div>

              {/* Escalation Info */}
              <div className="escalation-section">
                <h3>📨 Escalation Status</h3>
                {selectedException.escalated_at ? (
                  <div className="escalated-box">
                    <div className="escalated-row">
                      <span className="escalated-label">Escalated At:</span>
                      <span>{formatDate(selectedException.escalated_at)}</span>
                    </div>
                    {selectedException.escalated_to && (
                      <div className="escalated-row">
                        <span className="escalated-label">Escalated To:</span>
                        <span className="escalated-email">{selectedException.escalated_to}</span>
                      </div>
                    )}
                    {selectedException.whatsapp_sid && (
                      <div className="escalated-row">
                        <span className="escalated-label">WhatsApp SID:</span>
                        <span className="mono">{selectedException.whatsapp_sid}</span>
                      </div>
                    )}
                    {selectedException.whatsapp_sent_to && (
                      <div className="escalated-row">
                        <span className="escalated-label">Sent To:</span>
                        <span>{selectedException.whatsapp_sent_to}</span>
                      </div>
                    )}
                    {selectedException.whatsapp_status && (
                      <div className="escalated-row">
                        <span className="escalated-label">Status:</span>
                        <span className="whatsapp-status">{selectedException.whatsapp_status}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="not-escalated-text">Not yet escalated</p>
                )}
              </div>

              {/* Follow-up Info - UPDATED WITH CUSTOMER REPLY */}
              <div className="escalation-section">
                <h3>📧 Follow-up Status</h3>
                {selectedException.followup_sent_at ? (
                  <div className="escalated-box" style={{ borderColor: '#93c5fd', background: '#eff6ff' }}>
                    <div className="escalated-row">
                      <span className="escalated-label">Sent At:</span>
                      <span>{formatDate(selectedException.followup_sent_at)}</span>
                    </div>
                    {selectedException.followup_sent_to && (
                      <div className="escalated-row">
                        <span className="escalated-label">Sent To:</span>
                        <span className="escalated-email">{selectedException.followup_sent_to}</span>
                      </div>
                    )}
                    {selectedException.followup_status && (
                      <div className="escalated-row">
                        <span className="escalated-label">Status:</span>
                        <span className="whatsapp-status" style={{ 
                          color: selectedException.followup_status === 'replied' ? '#16a34a' : 
                                 selectedException.followup_status === 'promised_payment' ? '#f59e0b' : 
                                 '#6b7280' 
                        }}>
                          {selectedException.followup_status === 'awaiting_reply' ? '⏳ Awaiting Reply' :
                           selectedException.followup_status === 'replied' ? '✅ Replied' :
                           selectedException.followup_status === 'promised_payment' ? '📅 Payment Promised' :
                           selectedException.followup_status}
                        </span>
                      </div>
                    )}
                    
                    {/* ✅ CUSTOMER REPLY SECTION - ADD THIS BLOCK */}
                    {selectedException.followup_reply && (
                      <div className="escalated-row" style={{ 
                        marginTop: '8px', 
                        paddingTop: '8px', 
                        borderTop: '1px dashed #93c5fd' 
                      }}>
                        <span className="escalated-label" style={{ fontWeight: 600, color: '#1e40af' }}>
                          Customer Reply:
                        </span>
                        <span style={{ 
                          background: '#e0e7ff', 
                          padding: '4px 12px', 
                          borderRadius: '6px',
                          fontStyle: 'italic',
                          color: '#1e40af',
                          fontSize: '13px'
                        }}>
                          "{selectedException.followup_reply}"
                        </span>
                      </div>
                    )}
                    {/* ✅ END OF CUSTOMER REPLY SECTION */}
                    
                    {selectedException.followup_reply_at && (
                      <div className="escalated-row">
                        <span className="escalated-label">Replied At:</span>
                        <span>{formatDate(selectedException.followup_reply_at)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="not-escalated-text">No follow-up sent</p>
                )}
              </div>

              {/* Recommended Action */}
              <div className="action-box">
                <span className="action-label">💡 Recommended Action</span>
                <p className="action-value">{selectedException.recommended_action || 'No action recommended'}</p>
              </div>

              {/* Evidence */}
              <div className="evidence-section">
                <h3>📋 Evidence</h3>
                <ul className="evidence-list">
                  {selectedException.evidence?.map((item, idx) => (
                    <li key={idx}>
                      <span className="bullet">•</span>
                      <span className="text">{item}</span>
                    </li>
                  )) || (
                    <li className="no-evidence">No evidence recorded</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowDetailModal(false)} className="btn-close-modal">
                Close
              </button>
              {['partial_payment', 'pending', 'overdue', 'exception'].includes(selectedException.status) && (
                <button
                  onClick={() => {
                    setFollowupExceptionId(selectedException.id);
                    setShowFollowupModal(true);
                    setShowDetailModal(false);
                  }}
                  className="btn-escalate-modal"
                  style={{ background: '#22c55e' }}
                  disabled={followupSending === selectedException.id}
                >
                  📧 Follow-up
                </button>
              )}
              {['pending', 'overdue', 'exception'].includes(selectedException.status) && (
                <button
                  onClick={() => {
                    handleEscalate(selectedException.id);
                    setShowDetailModal(false);
                  }}
                  disabled={escalating === selectedException.id}
                  className="btn-escalate-modal"
                >
                  {escalating === selectedException.id ? '⏳ Sending...' : '🚨 Escalate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}