import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../DashboardLayout';
import {
  getFacultyReviewQueue,
  getFacultyAssignedStudents,
  getWeeklyReport,
  getWeeklyReportReviews,
  submitFacultyReview
} from '../../../services/weeklyReportV2Service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  DRAFT:                { bg: 'bg-gray-100',  text: 'text-gray-700',  label: 'Draft' },
  SUBMITTED:            { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'Submitted' },
  CORRECTION_REQUESTED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Correction Requested' },
  APPROVED:             { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
};

const LOG_STATUS_CFG = {
  DRAFT:                { bg: 'bg-gray-50',  text: 'text-gray-500',  label: 'Draft' },
  SUBMITTED:            { bg: 'bg-blue-50',  text: 'text-blue-600',  label: 'Submitted' },
  CORRECTION_REQUESTED: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Correction' },
  APPROVED:             { bg: 'bg-green-50', text: 'text-green-700', label: 'Approved' },
};

const StatusBadge = ({ status }) => {
  const c = STATUS_CFG[status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`${c.bg} ${c.text} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold`}>
      {c.label}
    </span>
  );
};

const LogStatusBadge = ({ status }) => {
  const c = LOG_STATUS_CFG[status] || { bg: 'bg-gray-50', text: 'text-gray-500', label: status };
  return (
    <span className={`${c.bg} ${c.text} inline-flex items-center px-2 py-0.5 rounded text-xs font-medium`}>
      {c.label}
    </span>
  );
};

const fmtDate = (d) => {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length === 3) {
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtTs = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const extractError = (err) => {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.message) return err.message;
  return 'An unexpected error occurred.';
};

const Spinner = ({ sm }) => (
  <div className={`animate-spin rounded-full border-2 border-indigo-500 border-t-transparent ${sm ? 'h-4 w-4' : 'h-8 w-8'}`} />
);

// ─── Main Component ───────────────────────────────────────────────────────────

function FacultyDashboard() {
  const [activeTab, setActiveTab]           = useState('queue'); // 'queue' | 'students'
  const [queue, setQueue]                   = useState([]);
  const [pagination, setPagination]         = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading]               = useState(true);
  const [pageError, setPageError]           = useState('');
  const [view, setView]                     = useState('queue'); // 'queue' | 'detail'
  const [selectedReport, setSelectedReport] = useState(null);
  const [reviews, setReviews]               = useState([]);
  const [detailLoading, setDetailLoading]   = useState(false);

  // Assigned Students state
  const [students, setStudents]             = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsSearch, setStudentsSearch]   = useState('');

  // Review form state
  const [decision, setDecision]             = useState('');
  const [remarks, setRemarks]               = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError]       = useState('');
  const [reviewSuccess, setReviewSuccess]   = useState('');

  // ── Load queue ────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async (page = 1) => {
    setLoading(true);
    setPageError('');
    try {
      const res = await getFacultyReviewQueue({ page, limit: 20 });
      setQueue(res?.data || []);
      setPagination(res?.pagination || { page, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setPageError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load assigned students ────────────────────────────────────────────────
  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setPageError('');
    try {
      const res = await getFacultyAssignedStudents({ limit: 100 });
      setStudents(res?.data || []);
    } catch (err) {
      setPageError(extractError(err));
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => { 
    if (activeTab === 'queue') {
      loadQueue(1); 
    } else if (activeTab === 'students') {
      loadStudents();
    }
  }, [activeTab, loadQueue, loadStudents]);

  // ── Open report detail ────────────────────────────────────────────────────
  const openDetail = async (queueItem) => {
    setDetailLoading(true);
    setPageError('');
    setReviewError('');
    setReviewSuccess('');
    setDecision('');
    setRemarks('');
    try {
      const [detailRes, reviewsRes] = await Promise.all([
        getWeeklyReport(queueItem.internship_id, queueItem.id),
        getWeeklyReportReviews(queueItem.internship_id, queueItem.id)
      ]);
      setSelectedReport({ ...detailRes?.data, student: queueItem.student });
      setReviews(reviewsRes?.data || []);
      setView('detail');
    } catch (err) {
      setPageError(extractError(err));
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Submit Review Decision ────────────────────────────────────────────────
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!decision) {
      setReviewError('Please select a decision.');
      return;
    }
    if (decision === 'CORRECTION_REQUESTED' && !remarks.trim()) {
      setReviewError('Remarks are required when requesting a correction.');
      return;
    }

    setReviewSubmitting(true);
    setReviewError('');
    setReviewSuccess('');

    try {
      const res = await submitFacultyReview(
        selectedReport.internship_id,
        selectedReport.id,
        { decision, remarks: remarks.trim() }
      );

      setReviewSuccess(
        decision === 'APPROVED'
          ? 'Weekly report approved successfully.'
          : 'Correction requested. The student will be prompted to revise.'
      );

      // Update local state
      setSelectedReport(prev => ({ ...prev, status: decision }));
      if (res?.data) {
        setReviews(prev => [res.data, ...prev]);
      }

      // Refresh queue in background
      loadQueue(pagination.page);
    } catch (err) {
      setReviewError(extractError(err));
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ── Approval dependency check ─────────────────────────────────────────────
  const linkedLogs = selectedReport?.linked_logs || [];
  const unapprovedLogs = linkedLogs.filter(l => l.status !== 'APPROVED');
  const canApprove = unapprovedLogs.length === 0;

  // Filter students based on search query
  const filteredStudents = students.filter(s => {
    const q = studentsSearch.toLowerCase();
    const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
    const email = (s.email || '').toLowerCase();
    const studentId = (s.studentIdNumber || '').toLowerCase();
    const company = (s.companyName || '').toLowerCase();
    const batch = (s.batchName || '').toLowerCase();
    return fullName.includes(q) || email.includes(q) || studentId.includes(q) || company.includes(q) || batch.includes(q);
  });

  // ── Detail View ────────────────────────────────────────────────────────────
  if (view === 'detail' && selectedReport) {
    const r = selectedReport;
    const isReviewable = r.status === 'SUBMITTED';

    return (
      <DashboardLayout userRole="coordinator">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button onClick={() => setView('queue')}
              className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">
              ← Back to Review Queue
            </button>
            <StatusBadge status={r.status} />
          </div>

          {pageError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{pageError}</div>
          )}

          {/* Report card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {fmtDate(r.start_date)} — {fmtDate(r.end_date)}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Student: <strong>{r.student?.first_name} {r.student?.last_name}</strong>
                  {r.student?.email && <span className="ml-2 text-gray-400">({r.student.email})</span>}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{(r.linked_hours || 0).toFixed(1)}</div>
                <div className="text-xs text-blue-400 mt-1">Total Hours</div>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{(r.approved_hours || 0).toFixed(1)}</div>
                <div className="text-xs text-green-400 mt-1">Mentor-Approved</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">{linkedLogs.length}</div>
                <div className="text-xs text-gray-400 mt-1">Linked Logs</div>
              </div>
            </div>

            {r.student_notes
              ? <div className="mb-5">
                  <h3 className="text-sm font-semibold text-gray-600 mb-1">Student Notes</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{r.student_notes}</p>
                </div>
              : <p className="text-sm text-gray-400 italic mb-5">No notes provided.</p>
            }
          </div>

          {/* Linked Daily Logs */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Linked Daily Logs</h2>
            {linkedLogs.length === 0
              ? <p className="text-gray-400 text-sm italic">No daily logs linked.</p>
              : (
                <div className="space-y-3">
                  {linkedLogs.map(log => {
                    const hrs = (log.tasks || []).reduce((s, t) => s + parseFloat(t.hours || 0), 0);
                    return (
                      <div key={log.id} className={`border rounded-xl p-4 ${
                        log.status === 'APPROVED' ? 'border-green-100 bg-green-50/30' : 'border-amber-100 bg-amber-50/30'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-800">{fmtDate(log.date)}</span>
                          <div className="flex items-center gap-2">
                            <LogStatusBadge status={log.status} />
                            <span className="text-sm font-bold text-gray-700">{hrs.toFixed(1)} hrs</span>
                          </div>
                        </div>
                        {log.tasks && log.tasks.length > 0 && (
                          <ul className="text-xs text-gray-500 space-y-0.5 pl-2">
                            {log.tasks.map((t, i) => (
                              <li key={i} className="flex justify-between">
                                <span>{t.description}</span>
                                <span className="ml-2 font-medium">{t.hours}h</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>

          {/* Approval dependency warning */}
          {isReviewable && !canApprove && (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
              <p className="font-semibold mb-2">⚠️ Cannot Approve Yet — Daily Logs Pending Mentor Review</p>
              <p className="mb-2">The following logs must be <strong>APPROVED</strong> by the company mentor before this report can be approved:</p>
              <ul className="list-disc list-inside space-y-1">
                {unapprovedLogs.map(l => (
                  <li key={l.id}>{fmtDate(l.date)} — <LogStatusBadge status={l.status} /></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-600">You may still request a correction at any time. The backend enforces this rule.</p>
            </div>
          )}

          {/* Review History */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Review History</h2>
            {reviews.length === 0
              ? <p className="text-gray-400 text-sm italic">No reviews yet.</p>
              : (
                <div className="space-y-3">
                  {reviews.map(rv => (
                    <div key={rv.id}
                      className={`rounded-xl p-4 border ${rv.status === 'APPROVED'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rv.status === 'APPROVED'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {rv.status === 'APPROVED' ? '✅ Approved' : '⚠️ Correction Requested'}
                        </span>
                        <span className="text-xs text-gray-400">{fmtTs(rv.reviewed_at)}</span>
                      </div>
                      {rv.remarks && <p className="text-sm text-gray-700 mt-1">{rv.remarks}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        — {rv.reviewer?.first_name} {rv.reviewer?.last_name}
                      </p>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Faculty Review Form */}
          {isReviewable && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Submit Review Decision</h2>

              {reviewSuccess && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">
                  {reviewSuccess}
                </div>
              )}

              {reviewError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                  {reviewError}
                </div>
              )}

              <form onSubmit={handleReviewSubmit} className="space-y-4">
                {/* Decision */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                  <div className="flex gap-3">
                    <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${
                      decision === 'APPROVED'
                        ? 'bg-green-50 border-green-400'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    } ${!canApprove ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input
                        type="radio"
                        name="decision"
                        value="APPROVED"
                        checked={decision === 'APPROVED'}
                        disabled={!canApprove}
                        onChange={() => setDecision('APPROVED')}
                        className="text-green-600"
                      />
                      <span className="font-medium text-sm text-green-700">✅ Approve</span>
                    </label>
                    <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${
                      decision === 'CORRECTION_REQUESTED'
                        ? 'bg-amber-50 border-amber-400'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}>
                      <input
                        type="radio"
                        name="decision"
                        value="CORRECTION_REQUESTED"
                        checked={decision === 'CORRECTION_REQUESTED'}
                        onChange={() => setDecision('CORRECTION_REQUESTED')}
                        className="text-amber-600"
                      />
                      <span className="font-medium text-sm text-amber-700">⚠️ Request Correction</span>
                    </label>
                  </div>
                  {!canApprove && (
                    <p className="mt-1 text-xs text-amber-600">
                      Approve is disabled: all linked daily logs must be mentor-APPROVED first.
                    </p>
                  )}
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks {decision === 'CORRECTION_REQUESTED' && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder={decision === 'CORRECTION_REQUESTED'
                      ? 'Required — explain what the student should correct...'
                      : 'Optional — add remarks for the student...'
                    }
                    className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <div className="text-right text-xs text-gray-400 mt-1">{remarks.length}/1000</div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button type="submit" disabled={reviewSubmitting || !decision}
                    className="px-6 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                    {reviewSubmitting && <Spinner sm />}
                    Submit Review
                  </button>
                </div>
              </form>
            </div>
          )}

          {r.status === 'APPROVED' && (
            <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-semibold text-center">
              ✅ This report has been approved. No further action needed.
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ── Main Dashboard View with Tab Navigation ───────────────────────────────
  return (
    <DashboardLayout userRole="coordinator">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header and Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Faculty Advisor Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Supervise student cohorts, monitor internship progress, and review weekly reports
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => { setActiveTab('queue'); setView('queue'); }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === 'queue'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Review Queue {queue.length > 0 && (
                  <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700">
                    {queue.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setActiveTab('students'); setView('queue'); }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === 'students'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Assigned Students
              </button>
            </div>

            <button
              onClick={() => {
                if (activeTab === 'queue') loadQueue(1);
                else loadStudents();
              }}
              className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 shadow-sm"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {pageError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center justify-between">
            <span>{pageError}</span>
            <button onClick={() => setPageError('')} className="text-red-400 hover:text-red-600 ml-2">✕</button>
          </div>
        )}

        {/* ── TAB 1: REVIEW QUEUE ────────────────────────────────────────── */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            {detailLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-400 p-4">
                <Spinner sm /> Loading report…
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Spinner />
              </div>
            ) : queue.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="text-5xl mb-4">📭</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Queue is Empty</h3>
                <p className="text-gray-400 text-sm">No submitted weekly reports awaiting review for your assigned students or batches.</p>
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-500">
                  Showing {queue.length} of {pagination.total} reports awaiting review
                </div>
                <div className="space-y-3">
                  {queue.map(item => (
                    <div
                      key={item.id}
                      onClick={() => openDetail(item)}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">
                              {fmtDate(item.start_date)} — {fmtDate(item.end_date)}
                            </span>
                            <StatusBadge status={item.status} />
                          </div>
                          <p className="text-sm text-gray-600">
                            {item.student?.first_name} {item.student?.last_name}
                            {item.student?.email && <span className="text-gray-400 ml-1">({item.student.email})</span>}
                          </p>
                          <div className="flex gap-4 text-xs text-gray-500 mt-1">
                            <span>🕐 {(item.linked_hours || 0).toFixed(1)} hrs total</span>
                            <span>✅ {(item.approved_hours || 0).toFixed(1)} mentor-approved</span>
                          </div>
                        </div>
                        <span className="text-indigo-600 font-semibold text-sm shrink-0">Review ›</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex justify-center gap-2 pt-2">
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        onClick={() => loadQueue(p)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                          p === pagination.page
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB 2: ASSIGNED STUDENTS (READ-ONLY) ────────────────────────── */}
        {activeTab === 'students' && (
          <div className="space-y-5">
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <input
                type="text"
                value={studentsSearch}
                onChange={e => setStudentsSearch(e.target.value)}
                placeholder="Search by student name, ID, email, company, or batch..."
                className="w-full sm:w-96 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
              <span className="text-xs text-gray-500">
                {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'} found
              </span>
            </div>

            {studentsLoading ? (
              <div className="flex items-center justify-center h-48">
                <Spinner />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="text-5xl mb-4">🎓</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Students Found</h3>
                <p className="text-gray-400 text-sm">
                  {studentsSearch ? 'No students matched your search criteria.' : 'No students are currently assigned to your supervision.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        <th className="py-3.5 px-4">Student</th>
                        <th className="py-3.5 px-4">Batch</th>
                        <th className="py-3.5 px-4">Company & Status</th>
                        <th className="py-3.5 px-4">Period</th>
                        <th className="py-3.5 px-4">Hours Rendered</th>
                        <th className="py-3.5 px-4">Latest Report</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredStudents.map(stu => {
                        const progressPct = stu.totalHours > 0 
                          ? Math.min(100, Math.round((stu.completedHours / stu.totalHours) * 100))
                          : 0;

                        return (
                          <tr key={stu.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-gray-900">
                                {stu.firstName} {stu.lastName}
                              </div>
                              <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                                <span>{stu.email}</span>
                                {stu.studentIdNumber && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono">{stu.studentIdNumber}</span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                {stu.batchName}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-gray-800">{stu.companyName}</div>
                              <div className="mt-0.5">
                                <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
                                  stu.internshipStatus === 'IN_PROGRESS' || stu.internshipStatus === 'APPROVED'
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : stu.internshipStatus === 'COMPLETED'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-gray-50 text-gray-600 border border-gray-200'
                                }`}>
                                  {stu.internshipStatus}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-gray-600 whitespace-nowrap">
                              <div>{fmtDate(stu.startDate)} —</div>
                              <div className="text-gray-400">{fmtDate(stu.endDate)}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-between text-xs font-semibold text-gray-700 mb-1">
                                <span>{stu.completedHours.toFixed(1)} / {stu.totalHours} hrs</span>
                                <span className="text-indigo-600">{progressPct}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              {stu.latestWeeklyReportStatus ? (
                                <StatusBadge status={stu.latestWeeklyReportStatus} />
                              ) : (
                                <span className="text-xs text-gray-400 italic">None</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default FacultyDashboard;
