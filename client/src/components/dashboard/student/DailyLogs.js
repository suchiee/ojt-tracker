import React, { useState, useEffect, useCallback } from 'react';
import { 
  FaClock, 
  FaTasks, 
  FaStickyNote, 
  FaCalendarAlt, 
  FaTrash, 
  FaEdit, 
  FaPlus, 
  FaCheckCircle, 
  FaExclamationTriangle, 
  FaPaperPlane, 
  FaChevronDown, 
  FaChevronUp, 
  FaHistory,
  FaSpinner
} from 'react-icons/fa';
import { 
  getDailyLogs as getLegacyDailyLogs, 
  createDailyLog as createLegacyDailyLog, 
  updateDailyLog as updateLegacyDailyLog, 
  deleteDailyLog as deleteLegacyDailyLog 
} from '../../../services/trainingService';
import {
  getInternships
} from '../../../services/internshipV2Service';
import {
  getDailyLogs,
  getDailyLog,
  createDailyLog,
  updateDailyLog,
  deleteDailyLog,
  submitDailyLog,
  getDailyLogReviews
} from '../../../services/dailyLogV2Service';
import DashboardLayout from '../DashboardLayout';

function DailyLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  
  // V2 Hybrid Context States
  const [isV2, setIsV2] = useState(false);
  const [internshipId, setInternshipId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedLogs, setExpandedLogs] = useState({}); // { [id]: { tasks: [], reviews: [], loading: boolean } }

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState([{ description: '', hours: '' }]);
  const [notes, setNotes] = useState('');

  // Initial resolve of V2 Active Internship
  const resolveActiveContext = useCallback(async () => {
    try {
      const internshipsRes = await getInternships();
      const active = (internshipsRes?.data || []).find(i => i.status === 'ACTIVE');
      if (active) {
        setIsV2(true);
        setInternshipId(active.id);
        return active.id;
      }
    } catch (v2Err) {
      console.warn('V2 Active Internship resolution failed, default to legacy MongoDB:', v2Err.message);
    }
    setIsV2(false);
    setInternshipId(null);
    return null;
  }, []);

  const loadLogs = useCallback(async (activeId, page = 1) => {
    try {
      setLoading(true);
      setError('');
      if (activeId) {
        // Query V2 PostgreSQL
        const logsRes = await getDailyLogs(activeId, { page, limit: 10 });
        setLogs(logsRes.data || []);
        setCurrentPage(logsRes.pagination?.page || 1);
        setTotalPages(logsRes.pagination?.totalPages || 1);
      } else {
        // Fallback to legacy MongoDB
        const fetchedLogs = await getLegacyDailyLogs();
        setLogs(fetchedLogs || []);
        setCurrentPage(1);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Error loading logs:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load daily logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    resolveActiveContext().then((id) => {
      loadLogs(id, 1);
    });
  }, [resolveActiveContext, loadLogs]);

  const resetForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setTasks([{ description: '', hours: '' }]);
    setNotes('');
    setEditingLogId(null);
  };

  const addTask = () => {
    setTasks([...tasks, { description: '', hours: '' }]);
  };

  const updateTask = (index, field, value) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    setTasks(newTasks);
  };

  const removeTask = (index) => {
    const newTasks = tasks.filter((_, i) => i !== index);
    setTasks(newTasks);
  };

  // Expand log row on demand to fetch tasks and review history
  const toggleExpandLog = async (log) => {
    const logId = isV2 ? log.id : log._id;
    if (expandedLogs[logId]) {
      // Collapse
      const updated = { ...expandedLogs };
      delete updated[logId];
      setExpandedLogs(updated);
      return;
    }

    // Set loading state for this log row
    setExpandedLogs(prev => ({
      ...prev,
      [logId]: { tasks: [], reviews: [], loading: true }
    }));

    try {
      let logTasks = [];
      let logReviews = [];

      if (isV2) {
        // Fetch V2 Log Detail (contains tasks) and Reviews History
        const [detailRes, reviewsRes] = await Promise.all([
          getDailyLog(internshipId, logId),
          getDailyLogReviews(internshipId, logId)
        ]);
        logTasks = detailRes.data?.tasks || [];
        logReviews = reviewsRes.data || [];
      } else {
        // MongoDB legacy already holds tasks in the row object
        logTasks = log.tasks || [];
        logReviews = [];
      }

      setExpandedLogs(prev => ({
        ...prev,
        [logId]: { tasks: logTasks, reviews: logReviews, loading: false }
      }));
    } catch (err) {
      console.error('Failed to load log details/reviews:', err);
      setExpandedLogs(prev => ({
        ...prev,
        [logId]: { tasks: [], reviews: [], loading: false, error: 'Failed to load details' }
      }));
    }
  };

  const handleEdit = async (log) => {
    const logId = isV2 ? log.id : log._id;
    
    // In V2, daily logs can only be edited in DRAFT or CORRECTION_REQUESTED statuses
    if (isV2 && log.status !== 'DRAFT' && log.status !== 'CORRECTION_REQUESTED') {
      setError('This log is submitted or approved and is locked for editing.');
      return;
    }

    try {
      let fullTasks = [];
      if (isV2) {
        // Load details to get full tasks array
        const detailRes = await getDailyLog(internshipId, logId);
        fullTasks = detailRes.data?.tasks || [];
      } else {
        fullTasks = log.tasks || [];
      }

      setDate(new Date(log.date).toISOString().split('T')[0]);
      setTasks(fullTasks.map(task => ({ 
        description: task.description || '', 
        hours: task.hours || '' 
      })));
      setNotes(log.notes || '');
      setEditingLogId(logId);
      setShowForm(true);
      window.scrollTo(0, 0);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch log details for editing.');
    }
  };

  const handleDelete = async (log) => {
    const logId = isV2 ? log.id : log._id;

    if (isV2 && log.status !== 'DRAFT') {
      setError('You can only delete daily logs in DRAFT status.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this log?')) return;
    
    try {
      if (isV2) {
        await deleteDailyLog(internshipId, logId);
      } else {
        await deleteLegacyDailyLog(logId);
      }
      await loadLogs(internshipId, currentPage);
      setError('');
    } catch (err) {
      console.error('Error deleting log:', err);
      setError(err.response?.data?.message || 'Failed to delete log. Please try again.');
    }
  };

  const handleSubmitLog = async (log) => {
    if (!window.confirm('Are you sure you want to submit this log to your mentor? Once submitted, it cannot be edited until correction is requested.')) {
      return;
    }

    try {
      setLoading(true);
      await submitDailyLog(internshipId, log.id);
      await loadLogs(internshipId, currentPage);
      setError('');
    } catch (err) {
      console.error('Error submitting log:', err);
      setError(err.response?.data?.message || 'Failed to submit log.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate tasks
    const totalHours = tasks.reduce((sum, task) => sum + (parseFloat(task.hours) || 0), 0);
    if (totalHours === 0) {
      setError('Please enter at least one task with hours');
      return;
    }

    // Validate each task
    for (const task of tasks) {
      if (!task.description.trim()) {
        setError('Please enter a description for all tasks');
        return;
      }
      if (!task.hours || parseFloat(task.hours) <= 0) {
        setError('Please enter valid hours for all tasks');
        return;
      }
    }

    try {
      const payload = {
        date: new Date(date).toISOString().split('T')[0],
        tasks: tasks.map(task => ({
          description: task.description.trim(),
          hours: parseFloat(task.hours)
        })),
        notes: notes.trim()
      };

      if (isV2) {
        if (editingLogId) {
          const { date: _, ...updatePayload } = payload;
          await updateDailyLog(internshipId, editingLogId, updatePayload);
        } else {
          await createDailyLog(internshipId, payload);
        }
      } else {
        const legacyPayload = {
          ...payload,
          date: new Date(date).toISOString(),
          totalHours: parseFloat(totalHours.toFixed(2))
        };
        if (editingLogId) {
          await updateLegacyDailyLog(editingLogId, legacyPayload);
        } else {
          await createLegacyDailyLog(legacyPayload);
        }
      }
      
      resetForm();
      setShowForm(false);
      await loadLogs(internshipId, currentPage);
      setError('');
    } catch (err) {
      console.error('Error saving log:', err);
      setError(err.response?.data?.message || 'Failed to save log. Please verify constraints.');
    }
  };

  // Status Badge styling helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 flex items-center gap-1">
            <FaCheckCircle className="w-3.5 h-3.5" /> APPROVED
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
            <FaPaperPlane className="w-3 h-3 animate-pulse" /> SUBMITTED (Awaiting Review)
          </span>
        );
      case 'CORRECTION_REQUESTED':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1 animate-bounce">
            <FaExclamationTriangle className="w-3.5 h-3.5" /> CORRECTION REQUESTED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
            DRAFT
          </span>
        );
    }
  };

  if (loading && logs.length === 0) {
    return (
      <DashboardLayout userRole="student">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="student">
      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border-l-4 border-red-500">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Daily Work Logs</h2>
              <p className="text-xs text-gray-500 mt-1">
                {isV2 ? 'Connected to Supabase PostgreSQL V2' : 'Connected to legacy MongoDB'}
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 ease-in-out flex items-center"
            >
              {showForm ? 'Cancel' : <><FaPlus className="mr-2" /> New Log</>}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleFormSubmit} className="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-100 shadow-inner">
              <h3 className="text-lg font-medium text-gray-800 mb-4">
                {editingLogId ? 'Edit Daily Log' : 'Create Daily Log'}
              </h3>
              
              {/* Date */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FaCalendarAlt className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Tasks */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tasks Done
                </label>
                <div className="space-y-4">
                  {tasks.map((task, index) => (
                    <div key={index} className="flex gap-4 items-start">
                      <div className="flex-1">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FaTasks className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Describe what you worked on"
                            value={task.description}
                            onChange={(e) => updateTask(index, 'description', e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="w-32">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FaClock className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="number"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Hours"
                            value={task.hours}
                            onChange={(e) => updateTask(index, 'hours', e.target.value)}
                            min="0.1"
                            max="24"
                            step="0.1"
                            required
                          />
                        </div>
                      </div>
                      {tasks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTask(index)}
                          className="p-2 text-red-600 hover:text-red-800"
                        >
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addTask}
                    className="text-blue-600 hover:text-blue-800 flex items-center text-sm font-medium"
                  >
                    <FaPlus className="mr-2" />
                    Add Task Row
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Notes
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 pt-2 pointer-events-none">
                    <FaStickyNote className="h-5 w-5 text-gray-400" />
                  </div>
                  <textarea
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows="3"
                    placeholder="Provide additional details or comments (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  ></textarea>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-150 ease-in-out font-medium"
                >
                  {editingLogId ? 'Update Log' : 'Save Draft'}
                </button>
              </div>
            </form>
          )}

          {/* Logs List */}
          {logs.length > 0 ? (
            <div className="space-y-4">
              {logs.map((log) => {
                const logId = isV2 ? log.id : log._id;
                const isExpanded = !!expandedLogs[logId];
                const expData = expandedLogs[logId] || {};
                
                return (
                  <div key={logId} className="bg-gray-50 p-5 rounded-lg border border-gray-100 hover:shadow-md transition duration-150 ease-in-out">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center mb-2 gap-2 flex-wrap">
                          <div className="flex items-center">
                            <FaCalendarAlt className="text-blue-600 mr-2" />
                            <span className="font-semibold text-gray-800">
                              {new Date(log.date).toLocaleDateString()}
                            </span>
                          </div>
                          {isV2 && getStatusBadge(log.status)}
                        </div>
                        <div className="text-sm text-gray-600 mb-1 flex items-center gap-3">
                          <span>
                            Total Hours: <span className="font-semibold text-blue-600">{isV2 ? log.total_task_hours : log.totalHours}</span>
                          </span>
                          {isV2 && (
                            <span>
                              Tasks: <span className="font-semibold text-gray-800">{log.task_count}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Action buttons based on status */}
                      <div className="flex space-x-2">
                        {/* Expand/Collapse Button */}
                        <button
                          onClick={() => toggleExpandLog(log)}
                          className="p-2 text-gray-500 hover:text-gray-700 bg-white rounded border border-gray-200"
                          title="View details & tasks"
                        >
                          {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                        </button>

                        {(!isV2 || log.status === 'DRAFT' || log.status === 'CORRECTION_REQUESTED') && (
                          <button
                            onClick={() => handleEdit(log)}
                            className="p-2 text-blue-600 hover:text-blue-800 bg-white rounded border border-gray-200"
                            title="Edit log details"
                          >
                            <FaEdit />
                          </button>
                        )}

                        {(!isV2 || log.status === 'DRAFT') && (
                          <button
                            onClick={() => handleDelete(log)}
                            className="p-2 text-red-600 hover:text-red-800 bg-white rounded border border-gray-200"
                            title="Delete log draft"
                          >
                            <FaTrash />
                          </button>
                        )}

                        {isV2 && (log.status === 'DRAFT' || log.status === 'CORRECTION_REQUESTED') && (
                          <button
                            onClick={() => handleSubmitLog(log)}
                            className="p-2 text-green-600 hover:text-green-800 bg-white rounded border border-gray-200"
                            title="Submit log to mentor"
                          >
                            <FaPaperPlane />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Expanded details (tasks list & review comments) */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                        {expData.loading ? (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <FaSpinner className="animate-spin" /> Loading log details...
                          </div>
                        ) : (
                          <>
                            {/* Correction Requested banner */}
                            {isV2 && log.status === 'CORRECTION_REQUESTED' && expData.reviews?.length > 0 && (
                              <div className="p-3.5 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">
                                <div className="font-bold flex items-center gap-1.5 mb-1 text-yellow-900">
                                  <FaExclamationTriangle className="w-4 h-4" /> Latest Correction Comments:
                                </div>
                                <p className="italic font-medium">
                                  "{expData.reviews[expData.reviews.length - 1].feedback || 'No comments left.'}"
                                </p>
                              </div>
                            )}

                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                                <FaTasks className="text-blue-500" /> Tasks Detail:
                              </h4>
                              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1.5 ml-2">
                                {expData.tasks?.map((task, index) => (
                                  <li key={task.id || index}>
                                    <span className="font-medium">{task.description}</span> — <span className="text-blue-600 font-semibold">{task.hours} hrs</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            
                            {log.notes && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                                  <FaStickyNote className="text-indigo-500" /> Notes:
                                </h4>
                                <p className="text-sm text-gray-600 ml-2 whitespace-pre-line">{log.notes}</p>
                              </div>
                            )}

                            {/* Reviews history section */}
                            {isV2 && expData.reviews?.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                                  <FaHistory className="text-gray-500" /> Review History:
                                </h4>
                                <div className="space-y-2 ml-2">
                                  {expData.reviews.map((rev) => (
                                    <div key={rev.id} className="text-xs bg-white p-3 rounded border border-gray-100 flex flex-col gap-1.5 shadow-sm">
                                      <div className="flex justify-between items-center text-gray-500">
                                        <span className="font-semibold text-gray-700">
                                          Mentor: {rev.reviewer?.first_name} {rev.reviewer?.last_name}
                                        </span>
                                        <span>{new Date(rev.reviewed_at).toLocaleString()}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold">Decision:</span> 
                                        {getStatusBadge(rev.status)}
                                      </div>
                                      {rev.feedback && (
                                        <div className="text-gray-600 italic mt-0.5">
                                          Remarks: "{rev.feedback}"
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pagination controls for V2 */}
              {isV2 && totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-6">
                  <button
                    onClick={() => loadLogs(internshipId, currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3.5 py-1.5 rounded border text-sm font-medium bg-white disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => loadLogs(internshipId, currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3.5 py-1.5 rounded border text-sm font-medium bg-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-500 font-medium">No daily logs recorded yet.</p>
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 ease-in-out font-medium"
              >
                Create Your First Log
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default DailyLogs;