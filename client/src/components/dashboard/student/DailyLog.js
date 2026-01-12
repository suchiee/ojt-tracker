import React, { useState, useEffect } from 'react';
import { FaClock, FaTasks, FaStickyNote, FaCalendarAlt, FaTrash, FaEdit, FaPlus } from 'react-icons/fa';
import { getDailyLogs, createDailyLog, updateDailyLog, deleteDailyLog } from '../../../services/trainingService';

function DailyLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  
  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState([{ description: '', hours: '' }]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const fetchedLogs = await getDailyLogs();
      setLogs(fetchedLogs);
      setError('');
    } catch (error) {
      console.error('Error loading logs:', error);
      setError('Failed to load daily logs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

  const handleEdit = (log) => {
    setDate(new Date(log.date).toISOString().split('T')[0]);
    setTasks(log.tasks.map(task => ({ 
      description: task.description || '', 
      hours: task.hours || '' 
    })));
    setNotes(log.notes || '');
    setEditingLogId(log._id);
    setShowForm(true);
    window.scrollTo(0, 0);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this log?')) return;
    
    try {
      await deleteDailyLog(id);
      await loadLogs();
      setError('');
    } catch (error) {
      console.error('Error deleting log:', error);
      setError('Failed to delete log. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
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
      const logData = {
        date: new Date(date),
        tasks,
        notes,
        totalHours
      };

      if (editingLogId) {
        await updateDailyLog(editingLogId, logData);
      } else {
        await createDailyLog(logData);
      }
      
      resetForm();
      setShowForm(false);
      await loadLogs();
      setError('');
    } catch (error) {
      console.error('Error saving log:', error);
      setError('Failed to save log. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Daily Work Logs</h2>
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
          <form onSubmit={handleSubmit} className="mb-8 bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium text-gray-800 mb-4">
              {editingLogId ? 'Edit Log' : 'New Log'}
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
                Tasks
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
                          placeholder="Task description"
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
                          min="0"
                          step="0.5"
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
                  className="text-blue-600 hover:text-blue-800 flex items-center"
                >
                  <FaPlus className="mr-2" />
                  Add Task
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <div className="relative">
                <div className="absolute top-3 left-3 pointer-events-none">
                  <FaStickyNote className="h-5 w-5 text-gray-400" />
                </div>
                <textarea
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows="3"
                  placeholder="Add any additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {editingLogId ? 'Update Log' : 'Save Log'}
            </button>
          </form>
        )}

        {logs.length > 0 ? (
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log._id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center mb-2">
                      <FaCalendarAlt className="text-blue-600 mr-2" />
                      <span className="font-medium">{new Date(log.date).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      Total Hours: <span className="font-medium text-blue-600">{log.totalHours}</span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(log)}
                      className="p-2 text-blue-600 hover:text-blue-800"
                    >
                      <FaEdit />
                    </button>
                    <button
                      onClick={() => handleDelete(log._id)}
                      className="p-2 text-red-600 hover:text-red-800"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
                
                <div className="mt-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Tasks:</h4>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-2">
                    {log.tasks.map((task, index) => (
                      <li key={index}>
                        {task.description} - {task.hours} hours
                      </li>
                    ))}
                  </ul>
                </div>
                
                {log.notes && (
                  <div className="mt-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Notes:</h4>
                    <p className="text-sm text-gray-600">{log.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No daily logs found. Create your first log to track your OJT progress.</p>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 ease-in-out"
              >
                Create Log
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DailyLog; 