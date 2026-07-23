import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../DashboardLayout';
import {
  getMentorReviewQueue,
  getDailyLog,
  getLogReviewsHistory,
  submitMentorReview
} from '../../../services/dailyLogV2Service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  DRAFT:                { bg: 'bg-gray-100',  text: 'text-gray-700',  label: 'Draft' },
  SUBMITTED:            { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'Submitted' },
  CORRECTION_REQUESTED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Correction Requested' },
  APPROVED:             { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
};

const StatusBadge = ({ status }) => {
  const c = STATUS_CFG[status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`${c.bg} ${c.text} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold`}>
      {c.label}
    </span>
  );
};

const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtTs = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const extractError = (err) =>
  err?.response?.data?.message || err?.message || 'An unexpected error occurred.';

const Spinner = ({ sm }) => (
  <div className={`animate-spin rounded-full border-2 border-t-transparent ${sm ? 'h-4 w-4 border-white' : 'h-10 w-10 border-blue-600'}`} />
);

// ─── Main Component ───────────────────────────────────────────────────────────

function MentorDashboard() {
  const [queue, setQueue]                   = useState([]);
  const [pagination, setPagination]         = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading]               = useState(true);
  const [pageError, setPageError]           = useState('');
  const [dateFilter, setDateFilter]         = useState('');

  // View mode: 'queue' | 'detail'
  const [view, setView]                     = useState('queue');
  const [selectedLog, setSelectedLog]       = useState(null);
  const [queueContext, setQueueContext]     = useState(null);
  const [reviewsHistory, setReviewsHistory] = useState([]);
  const [detailLoading, setDetailLoading]   = useState(false);

  // Review decision form
  const [decision, setDecision]             = useState('');
  const [feedback, setFeedback]             = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [formError, setFormError]           = useState('');
  const [successMsg, setSuccessMsg]         = useState('');

  // ── Load review queue ─────────────────────────────────────────────────────
  const loadQueue = useCallback(async (page = 1, overrideDate = dateFilter) => {
    setLoading(true);
    setPageError('');
    try {
      const params = { page, limit: 20 };
      if (overrideDate) params.date = overrideDate;
      const res = await getMentorReviewQueue(params);
      setQueue(res?.data || []);
      setPagination(res?.pagination || { page, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setPageError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    loadQueue(1);
  }, [loadQueue]);

  // ── Open Daily Log Detail ──────────────────────────────────────────────────
  const openDetail = async (item) => {
    setDetailLoading(true);
    setPageError('');
    setFormError('');
    setSuccessMsg('');
    setDecision('');
    setFeedback('');
    setQueueContext(item);

    try {
      const [logRes, reviewsRes] = await Promise.all([
        getDailyLog(item.internship_id, item.id),
        getLogReviewsHistory(item.internship_id, item.id)
      ]);
      setSelectedLog(logRes?.data || null);
      setReviewsHistory(reviewsRes?.data || []);
      setView('detail');
    } catch (err) {
      setPageError(extractError(err));
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Submit Review Decision ─────────────────────────────────────────────────
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (!decision) {
      setFormError('Please select a review decision (Approve or Request Correction).');
      return;
    }

    const trimmedFeedback = feedback.trim();
    if (decision === 'CORRECTION_REQUESTED' && !trimmedFeedback) {
      setFormError('Feedback is mandatory when requesting a correction so the student knows what to revise.');
      return;
    }

    if (trimmedFeedback.length > 1000) {
      setFormError('Feedback exceeds the 1000-character maximum limit.');
      return;
    }

    setSubmitting(true);
    try {
      await submitMentorReview(selectedLog.internship_id, selectedLog.id, {
        decision,
        feedback: trimmedFeedback
      });

      setSuccessMsg(`Review submitted: ${decision === 'APPROVED' ? 'Daily log approved!' : 'Correction requested.'}`);

      // Refresh log detail and reviews history
      const [updatedLog, updatedHistory] = await Promise.all([
        getDailyLog(selectedLog.internship_id, selectedLog.id),
        getLogReviewsHistory(selectedLog.internship_id, selectedLog.id)
      ]);

      setSelectedLog(updatedLog?.data || selectedLog);
      setReviewsHistory(updatedHistory?.data || []);
      setDecision('');
      setFeedback('');

      // Refresh review queue in background
      loadQueue(pagination.page);
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filter reset ──────────────────────────────────────────────────────────
  const handleResetFilter = () => {
    setDateFilter('');
    loadQueue(1, '');
  };

  // ─── RENDER: Detail View ──────────────────────────────────────────────────
  if (view === 'detail' && selectedLog) {
    const log = selectedLog;
    const student = queueContext?.internship?.student;
    const jobRole = queueContext?.internship?.job_role;
    const isReviewable = log.status === 'SUBMITTED';

    return (
      <DashboardLayout userRole="mentor">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Header & Back Button */}
          <div className="flex items-center justify-between">
            <button onClick={() => setView('queue')}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm">
              ← Back to Review Queue
            </button>
            <StatusBadge status={log.status} />
          </div>

          {pageError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{pageError}</div>
          )}

          {/* Student & Log Info Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Daily Log — {fmtDate(log.date)}
                </h1>
                {student && (
                  <p className="text-sm text-gray-600 mt-1">
                    Student: <strong>{student.first_name} {student.last_name}</strong>
                    {student.email && <span className="ml-2 text-gray-400">({student.email})</span>}
                  </p>
                )}
                {jobRole && <p className="text-xs text-gray-400 mt-0.5">Role: {jobRole}</p>}
              </div>
              <div className="bg-blue-50 text-blue-700 rounded-xl px-4 py-2 text-center">
                <div className="text-xl font-bold">{(log.total_task_hours || 0).toFixed(1)} hrs</div>
                <div className="text-xs text-blue-400 font-medium">Logged Time</div>
              </div>
            </div>

            {/* Student Notes */}
            {log.notes ? (
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Student Notes</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{log.notes}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic mb-5">No notes provided for this log.</p>
            )}

            {/* Tasks Breakdown */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Task Breakdown</h3>
              {(log.tasks || []).length === 0 ? (
                <p className="text-sm text-gray-400 italic">No tasks listed.</p>
              ) : (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium text-xs border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2.5">Task Description</th>
                        <th className="px-4 py-2.5 text-right w-24">Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {log.tasks.map((t, idx) => (
                        <tr key={t.id || idx} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-gray-800">{t.description}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-700">{parseFloat(t.hours || 0).toFixed(1)}h</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold text-xs border-t border-gray-100">
                      <tr>
                        <td className="px-4 py-2.5 text-gray-600">Total Logged Time</td>
                        <td className="px-4 py-2.5 text-right text-blue-700">{(log.total_task_hours || 0).toFixed(1)} hrs</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Chronological Review History */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Review History</h2>
            {reviewsHistory.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No review entries yet.</p>
            ) : (
              <div className="space-y-3">
                {reviewsHistory.map(rv => (
                  <div key={rv.id} className={`rounded-xl p-4 border ${
                    rv.status === 'APPROVED' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        rv.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {rv.status === 'APPROVED' ? '✅ Approved' : '⚠️ Correction Requested'}
                      </span>
                      <span className="text-xs text-gray-400">{fmtTs(rv.reviewed_at)}</span>
                    </div>
                    {rv.feedback && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{rv.feedback}</p>}
                    <p className="text-xs text-gray-400 mt-2">
                      — {rv.reviewer?.first_name} {rv.reviewer?.last_name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review Decision Form */}
          {isReviewable ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Submit Review Decision</h2>

              {successMsg && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium">
                  {successMsg}
                </div>
              )}

              {formError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleReviewSubmit} className="space-y-4">
                {/* Decision Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                  <div className="flex gap-3">
                    <label className={`flex-1 flex items-center gap-2.5 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                      decision === 'APPROVED'
                        ? 'bg-green-50 border-green-400 shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}>
                      <input
                        type="radio"
                        name="decision"
                        value="APPROVED"
                        checked={decision === 'APPROVED'}
                        onChange={() => setDecision('APPROVED')}
                        className="text-green-600 h-4 w-4"
                      />
                      <div>
                        <span className="font-semibold text-sm text-green-800 block">✅ Approve Log</span>
                        <span className="text-xs text-green-600">Accept hours into student progress</span>
                      </div>
                    </label>

                    <label className={`flex-1 flex items-center gap-2.5 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                      decision === 'CORRECTION_REQUESTED'
                        ? 'bg-amber-50 border-amber-400 shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}>
                      <input
                        type="radio"
                        name="decision"
                        value="CORRECTION_REQUESTED"
                        checked={decision === 'CORRECTION_REQUESTED'}
                        onChange={() => setDecision('CORRECTION_REQUESTED')}
                        className="text-amber-600 h-4 w-4"
                      />
                      <div>
                        <span className="font-semibold text-sm text-amber-800 block">⚠️ Request Correction</span>
                        <span className="text-xs text-amber-600">Return to student for revisions</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Feedback Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Feedback {decision === 'CORRECTION_REQUESTED' && <span className="text-red-500">* (Required)</span>}
                  </label>
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder={
                      decision === 'CORRECTION_REQUESTED'
                        ? 'Explain what tasks or hours need correction...'
                        : 'Optional feedback for student...'
                    }
                    className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                  <div className="text-right text-xs text-gray-400 mt-1">{feedback.length}/1000</div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-end">
                  <button
                    type="submit"
                    disabled={submitting || !decision}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                  >
                    {submitting && <Spinner sm />}
                    Submit Decision
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium text-center">
              This log is currently in <strong>{log.status}</strong> status and cannot receive new reviews.
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ─── RENDER: Review Queue View ─────────────────────────────────────────────
  return (
    <DashboardLayout userRole="mentor">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header & Filter Controls */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Company Mentor Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Review pending daily logs submitted by your assigned interns</p>
          </div>
          <button
            onClick={() => loadQueue(1)}
            className="px-4 py-2 rounded-xl bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 border border-blue-200 shadow-sm"
          >
            Refresh Queue
          </button>
        </div>

        {/* Date Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filter Date:</span>
          <input
            type="date"
            value={dateFilter}
            onChange={e => {
              setDateFilter(e.target.value);
              loadQueue(1, e.target.value);
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {dateFilter && (
            <button
              onClick={handleResetFilter}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear Filter
            </button>
          )}
        </div>

        {pageError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center justify-between">
            <span>{pageError}</span>
            <button onClick={() => setPageError('')} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {detailLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 p-4">
            <Spinner sm /> Loading log detail…
          </div>
        )}

        {/* Queue Content */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Spinner />
          </div>
        ) : queue.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Review Queue is Empty</h3>
            <p className="text-gray-400 text-sm">No pending daily logs awaiting review for your assigned interns.</p>
          </div>
        ) : (
          <>
            <div className="text-xs font-medium text-gray-500">
              Showing {queue.length} of {pagination.total} pending daily logs
            </div>
            <div className="space-y-3">
              {queue.map(item => {
                const student = item.internship?.student;
                return (
                  <div
                    key={item.id}
                    onClick={() => openDetail(item)}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">
                            {fmtDate(item.date)}
                          </span>
                          <StatusBadge status={item.status} />
                        </div>
                        {student && (
                          <p className="text-sm text-gray-700 font-medium">
                            {student.first_name} {student.last_name}
                            {student.email && <span className="text-gray-400 font-normal ml-1">({student.email})</span>}
                          </p>
                        )}
                        {item.internship?.job_role && (
                          <p className="text-xs text-gray-400 mt-0.5">Role: {item.internship.job_role}</p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-gray-500 mt-2 truncate bg-gray-50 p-2 rounded-lg">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <span className="text-blue-500 text-sm font-medium shrink-0">Review Log ›</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => loadQueue(p)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      p === pagination.page
                        ? 'bg-blue-600 text-white'
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
    </DashboardLayout>
  );
}

export default MentorDashboard;

