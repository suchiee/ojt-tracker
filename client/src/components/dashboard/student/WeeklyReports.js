import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../DashboardLayout';
import { getInternships } from '../../../services/internshipV2Service';
import { getDailyLogs } from '../../../services/dailyLogV2Service';
import {
  getWeeklyReports,
  getWeeklyReport,
  createWeeklyReport,
  updateWeeklyReport,
  deleteWeeklyReport,
  submitWeeklyReport,
  getWeeklyReportReviews
} from '../../../services/weeklyReportV2Service';

// ─── Config & helpers ────────────────────────────────────────────────────────

const STATUS_CFG = {
  DRAFT:                { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'Draft' },
  SUBMITTED:            { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Submitted' },
  CORRECTION_REQUESTED: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Correction Requested' },
  APPROVED:             { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Approved' },
};

const LOG_STATUS_CFG = {
  DRAFT:                { bg: 'bg-gray-50',   text: 'text-gray-500',   label: 'Draft' },
  SUBMITTED:            { bg: 'bg-blue-50',   text: 'text-blue-600',   label: 'Submitted' },
  CORRECTION_REQUESTED: { bg: 'bg-amber-50',  text: 'text-amber-600',  label: 'Correction' },
  APPROVED:             { bg: 'bg-green-50',  text: 'text-green-700',  label: 'Approved' },
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
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtTs = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Snap any calendar date to the Monday of that week */
const getMonday = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
};

const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

const extractError = (err) =>
  err?.response?.data?.message || err?.message || 'An unexpected error occurred.';

// ─── Spinner ─────────────────────────────────────────────────────────────────
const Spinner = ({ sm }) => (
  <div className={`animate-spin rounded-full border-2 border-t-transparent ${sm ? 'h-4 w-4 border-white' : 'h-10 w-10 border-blue-600'}`} />
);

// ─── Main Component ───────────────────────────────────────────────────────────

function WeeklyReports() {
  const [internshipId, setInternshipId]     = useState(null);
  const [isV2, setIsV2]                     = useState(false);
  const [noV2Error, setNoV2Error]           = useState('');
  const [reports, setReports]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [pageError, setPageError]           = useState('');
  const [view, setView]                     = useState('list'); // 'list'|'create'|'edit'|'detail'
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailLoading, setDetailLoading]   = useState(false);
  const [reviews, setReviews]               = useState([]);

  // Form state
  const [formStartDate, setFormStartDate]   = useState('');
  const [formNotes, setFormNotes]           = useState('');
  const [formLogIds, setFormLogIds]         = useState([]);
  const [eligibleLogs, setEligibleLogs]     = useState([]);
  const [logsLoading, setLogsLoading]       = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError]           = useState('');

  // Action state
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitLoading, setSubmitLoading]   = useState(false);
  const [deleteLoading, setDeleteLoading]   = useState(false);

  // ── Bootstrap: resolve active internship ──────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await getInternships();
        const active = (res?.data || []).find(i => i.status === 'ACTIVE');
        if (active) {
          setInternshipId(active.id);
          setIsV2(true);
        } else {
          setNoV2Error('No active V2 internship found. Weekly Reports require an active V2 internship.');
          setLoading(false);
        }
      } catch {
        setNoV2Error('Could not load internship data. Please refresh.');
        setLoading(false);
      }
    })();
  }, []);

  // ── Load reports list ─────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    if (!internshipId) return;
    setLoading(true);
    setPageError('');
    try {
      const res = await getWeeklyReports(internshipId);
      setReports(res?.data || []);
    } catch (err) {
      setPageError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [internshipId]);

  useEffect(() => {
    if (internshipId) loadReports();
  }, [internshipId, loadReports]);

  // ── Open detail ────────────────────────────────────────────────────────────
  const openDetail = useCallback(async (r) => {
    setDetailLoading(true);
    setPageError('');
    try {
      const [dr, rr] = await Promise.all([
        getWeeklyReport(internshipId, r.id),
        getWeeklyReportReviews(internshipId, r.id)
      ]);
      setSelectedReport(dr?.data || r);
      setReviews(rr?.data || []);
      setView('detail');
    } catch (err) {
      setPageError(extractError(err));
    } finally {
      setDetailLoading(false);
    }
  }, [internshipId]);

  // ── Load eligible logs for a week ─────────────────────────────────────────
  const loadEligibleLogs = useCallback(async (start) => {
    if (!internshipId || !start) return;
    setLogsLoading(true);
    const end = addDays(start, 6);
    try {
      const res = await getDailyLogs(internshipId, { limit: 200 });
      const all = res?.data || [];
      setEligibleLogs(all.filter(l =>
        ['SUBMITTED', 'APPROVED'].includes(l.status) &&
        l.date >= start && l.date <= end
      ));
    } catch {
      setEligibleLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [internshipId]);

  // ── Form actions ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setFormStartDate('');
    setFormNotes('');
    setFormLogIds([]);
    setEligibleLogs([]);
    setFormError('');
    setView('create');
  };

  const openEdit = async (r) => {
    setFormError('');
    setFormNotes(r.student_notes || '');
    setFormLogIds((r.linked_logs || []).map(l => l.id));
    setFormStartDate(r.start_date);
    setSelectedReport(r);
    setView('edit');
    await loadEligibleLogs(r.start_date);
  };

  const handleStartDateChange = (val) => {
    const mon = val ? getMonday(val) : '';
    setFormStartDate(mon);
    setFormLogIds([]);
    if (mon) loadEligibleLogs(mon);
    else setEligibleLogs([]);
  };

  const toggleLog = (id) =>
    setFormLogIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formStartDate) { setFormError('Please select a reporting week.'); return; }
    setFormSubmitting(true);
    setFormError('');
    try {
      await createWeeklyReport(internshipId, {
        start_date: formStartDate,
        end_date: addDays(formStartDate, 6),
        student_notes: formNotes,
        daily_log_ids: formLogIds
      });
      await loadReports();
      setView('list');
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selectedReport) return;
    setFormSubmitting(true);
    setFormError('');
    try {
      await updateWeeklyReport(internshipId, selectedReport.id, {
        student_notes: formNotes,
        daily_log_ids: formLogIds
      });
      await loadReports();
      await openDetail(selectedReport);
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedReport) return;
    setSubmitLoading(true);
    setPageError('');
    try {
      const res = await submitWeeklyReport(internshipId, selectedReport.id);
      setShowSubmitConfirm(false);
      await loadReports();
      await openDetail(res?.data || selectedReport);
    } catch (err) {
      setPageError(extractError(err));
      setShowSubmitConfirm(false);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm('Delete this DRAFT weekly report? This cannot be undone.')) return;
    setDeleteLoading(true);
    setPageError('');
    try {
      await deleteWeeklyReport(internshipId, r.id);
      await loadReports();
      if (view === 'detail') setView('list');
    } catch (err) {
      setPageError(extractError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const latestCorrection = reviews.filter(rv => rv.status === 'CORRECTION_REQUESTED').slice(-1)[0];

  // ── Early exits ───────────────────────────────────────────────────────────
  if (!isV2 && !loading) {
    return (
      <DashboardLayout userRole="student">
        <div className="max-w-lg mx-auto mt-16 p-8 bg-white rounded-2xl shadow text-center">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Weekly Reports</h2>
          <p className="text-gray-500 text-sm">{noV2Error}</p>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout userRole="student">
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }

  // ── Create / Edit Form ────────────────────────────────────────────────────
  if (view === 'create' || view === 'edit') {
    const isEdit = view === 'edit';
    const endDate = formStartDate ? addDays(formStartDate, 6) : '';

    return (
      <DashboardLayout userRole="student">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6 gap-3">
            <button onClick={() => setView(isEdit ? 'detail' : 'list')}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm">
              ← Back
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEdit ? 'Edit Weekly Report' : 'Create Weekly Report'}
            </h1>
          </div>

          <form onSubmit={isEdit ? handleEdit : handleCreate} className="space-y-5">
            {formError && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                {formError}
              </div>
            )}

            {/* Reporting period */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Reporting Period</h3>
              {isEdit ? (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Dates are immutable after creation.</p>
                  <p className="font-medium text-gray-800">
                    {fmtDate(selectedReport?.start_date)} — {fmtDate(selectedReport?.end_date)}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pick any day in the reporting week
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => handleStartDateChange(e.target.value)}
                    className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {formStartDate && (
                    <p className="mt-2 text-sm text-blue-600">
                      Week: <strong>{fmtDate(formStartDate)}</strong> (Mon) → <strong>{fmtDate(endDate)}</strong> (Sun)
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    Must be a complete Monday–Sunday week. Backend enforces this rule.
                  </p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-800 mb-3">Weekly Notes / Summary</h3>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Describe your work this week — accomplishments, challenges, learnings..."
                className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="text-right text-xs text-gray-400 mt-1">{formNotes.length}/5000</div>
            </div>

            {/* Log selector */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-800 mb-1">Link Daily Logs</h3>
              <p className="text-xs text-gray-400 mb-3">
                Only SUBMITTED/APPROVED logs from this week. Backend enforces eligibility.
              </p>
              {!formStartDate && !isEdit && (
                <p className="text-sm text-gray-400 italic">Select a week above to see eligible logs.</p>
              )}
              {logsLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Spinner sm /> Loading eligible logs…
                </div>
              )}
              {!logsLoading && formStartDate && eligibleLogs.length === 0 && (
                <p className="text-sm text-amber-600">
                  No eligible logs for this week. Logs must be SUBMITTED or APPROVED.
                </p>
              )}
              {!logsLoading && eligibleLogs.length > 0 && (
                <div className="space-y-2">
                  {eligibleLogs.map(log => {
                    const hrs = (log.tasks || []).reduce((s, t) => s + parseFloat(t.hours || 0), 0);
                    const sel = formLogIds.includes(log.id);
                    return (
                      <label
                        key={log.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          sel ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleLog(log.id)}
                          className="h-4 w-4 rounded text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{fmtDate(log.date)}</span>
                            <LogStatusBadge status={log.status} />
                          </div>
                          <div className="text-xs text-gray-500">{hrs.toFixed(1)} hrs</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {formLogIds.length > 0 && (
                <p className="mt-3 text-sm font-medium text-blue-700">
                  {formLogIds.length} log{formLogIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setView(isEdit ? 'detail' : 'list')}
                className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">
                Cancel
              </button>
              <button type="submit" disabled={formSubmitting}
                className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {formSubmitting && <Spinner sm />}
                {isEdit ? 'Save Changes' : 'Create Report'}
              </button>
            </div>
          </form>
        </div>
      </DashboardLayout>
    );
  }

  // ── Detail View ────────────────────────────────────────────────────────────
  if (view === 'detail' && selectedReport) {
    const r = selectedReport;
    const canEdit   = ['DRAFT', 'CORRECTION_REQUESTED'].includes(r.status);
    const canDelete = r.status === 'DRAFT';
    const allApproved = (r.linked_logs || []).length > 0 &&
      (r.linked_logs || []).every(l => l.status === 'APPROVED');

    return (
      <DashboardLayout userRole="student">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button onClick={() => setView('list')}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm">
              ← Back to Reports
            </button>
            <StatusBadge status={r.status} />
          </div>

          {pageError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{pageError}</div>
          )}

          {/* Correction banner */}
          {r.status === 'CORRECTION_REQUESTED' && latestCorrection && (
            <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-xl">
              <p className="font-semibold text-amber-800 text-sm mb-1">📝 Faculty Remarks — Action Required</p>
              <p className="text-amber-700 text-sm">{latestCorrection.remarks}</p>
              <p className="text-xs text-amber-400 mt-1">
                — {latestCorrection.reviewer?.first_name} {latestCorrection.reviewer?.last_name},{' '}
                {fmtTs(latestCorrection.reviewed_at)}
              </p>
            </div>
          )}

          {/* Report card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-5">
              {fmtDate(r.start_date)} — {fmtDate(r.end_date)}
            </h1>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{(r.linked_hours || 0).toFixed(1)}</div>
                <div className="text-xs text-blue-400 mt-1">Total Hours</div>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{(r.approved_hours || 0).toFixed(1)}</div>
                <div className="text-xs text-green-400 mt-1">Approved Hours</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">{(r.linked_logs || []).length}</div>
                <div className="text-xs text-gray-400 mt-1">Linked Logs</div>
              </div>
            </div>

            {r.student_notes
              ? <div className="mb-5">
                  <h3 className="text-sm font-semibold text-gray-600 mb-1">Notes</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{r.student_notes}</p>
                </div>
              : <p className="text-sm text-gray-400 italic mb-5">No notes provided.</p>
            }

            {r.status === 'SUBMITTED' && (
              <div className="flex items-center gap-2 text-blue-600 bg-blue-50 rounded-lg px-4 py-3 text-sm mb-4">
                ⏳ Awaiting Faculty Review — read-only until reviewed.
              </div>
            )}
            {r.status === 'APPROVED' && (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-3 text-sm font-semibold mb-4">
                ✅ Approved by Faculty — this report is final and permanent.
              </div>
            )}

            {canEdit && (
              <div className="flex gap-3 flex-wrap">
                <button onClick={() => openEdit(r)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
                  Edit Report
                </button>
                <button onClick={() => setShowSubmitConfirm(true)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                  Submit for Review
                </button>
                {canDelete && (
                  <button onClick={() => handleDelete(r)} disabled={deleteLoading}
                    className="px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 disabled:opacity-50">
                    {deleteLoading ? 'Deleting…' : 'Delete Draft'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Linked logs */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Linked Daily Logs</h2>
            {(r.linked_logs || []).length === 0
              ? <p className="text-gray-400 text-sm italic">No daily logs linked.</p>
              : (
                <div className="space-y-3">
                  {(r.linked_logs || []).map(log => {
                    const hrs = (log.tasks || []).reduce((s, t) => s + parseFloat(t.hours || 0), 0);
                    return (
                      <div key={log.id} className="border border-gray-100 rounded-xl p-4">
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

          {/* Approval dependency notice */}
          {r.status !== 'APPROVED' && (r.linked_logs || []).length > 0 && !allApproved && (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm">
              <p className="font-semibold mb-1">⚠️ Approval Dependency</p>
              <p>
                All linked daily logs must be <strong>APPROVED</strong> by your company mentor before
                faculty can approve this report. Some logs are still pending mentor approval.
              </p>
            </div>
          )}

          {/* Review history */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Faculty Review History</h2>
            {reviews.length === 0
              ? <p className="text-gray-400 text-sm italic">No faculty reviews yet.</p>
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
        </div>

        {/* Submit Confirm Modal */}
        {showSubmitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Submit Weekly Report?</h3>
              <p className="text-gray-500 text-sm mb-4">
                Once submitted you cannot edit until faculty requests a correction.
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowSubmitConfirm(false)} disabled={submitLoading}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={submitLoading}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {submitLoading && <Spinner sm />}
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  // ── List View ──────────────────────────────────────────────────────────────
  return (
    <DashboardLayout userRole="student">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Weekly Reports</h1>
            <p className="text-sm text-gray-500 mt-1">Submit and track your weekly OJT progress reports</p>
          </div>
          {isV2 && (
            <button onClick={openCreate}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
              + New Report
            </button>
          )}
        </div>

        {pageError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center justify-between">
            <span>{pageError}</span>
            <button onClick={() => setPageError('')} className="text-red-400 hover:text-red-600 ml-2">✕</button>
          </div>
        )}

        {detailLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 p-4">
            <Spinner sm /> Loading report…
          </div>
        )}

        {/* Empty state */}
        {!loading && reports.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="text-5xl mb-4">📅</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Weekly Reports Yet</h3>
            <p className="text-gray-400 text-sm mb-6">Create your first report to start tracking weekly progress.</p>
            <button onClick={openCreate}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
              Create First Report
            </button>
          </div>
        )}

        {/* Reports list */}
        {reports.length > 0 && (
          <div className="space-y-3">
            {reports.map(r => (
              <div key={r.id} onClick={() => openDetail(r)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">
                        {fmtDate(r.start_date)} — {fmtDate(r.end_date)}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>🕐 {(r.linked_hours || 0).toFixed(1)} hrs</span>
                      <span>✅ {(r.approved_hours || 0).toFixed(1)} approved</span>
                    </div>
                    {r.student_notes && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{r.student_notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === 'DRAFT' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(r); }}
                        disabled={deleteLoading}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )}
                    <span className="text-blue-400 text-sm">›</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default WeeklyReports;
