import React, { useEffect, useMemo, useState } from 'react';
import { getAllStudents } from '../../../services/adminService';
import { FaUsers, FaBuilding, FaClipboardList } from 'react-icons/fa';
import { logout } from '../../../services/authService';

function AdminDashboard() {
  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    course: '',
    year: '',
    company: '',
    mentor: '',
    status: ''
  });
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerStudent, setDrawerStudent] = useState(null);
  const [savedViews, setSavedViews] = useState(() => {
    try {
      const raw = localStorage.getItem('admin_saved_views');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [newViewName, setNewViewName] = useState('');
  const [selectedView, setSelectedView] = useState('');

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const data = await getAllStudents();
        setStudents(data);
      } catch (err) {
        console.error('Error fetching students:', err);
        setError(err.message || 'Failed to fetch students');
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, []);

  const stats = useMemo(() => {
    const totalStudents = students.length;
    const activeTrainings = students.filter(s => s.trainingDetails && s.trainingDetails.status === 'active').length;
    const totalLogs = students.reduce((sum, s) => sum + ((s.dailyLogs && s.dailyLogs.length) || 0), 0);
    return { totalStudents, activeTrainings, totalLogs };
  }, [students]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searchMatched = (s) => {
      const company = s.trainingDetails?.agencyName || '';
      const mentor = s.trainingDetails?.mentor || '';
      const status =
        !s.trainingDetails || !s.trainingDetails.agencyName || !s.trainingDetails.mentor
          ? 'missing'
          : (s.trainingDetails.status || 'active');
      return (
        (!q ||
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.studentId || '').toLowerCase().includes(q) ||
          (s.course || '').toLowerCase().includes(q) ||
          (s.year || '').toLowerCase().includes(q) ||
          company.toLowerCase().includes(q) ||
          mentor.toLowerCase().includes(q)) &&
        (!filters.course || (s.course || '').toLowerCase() === filters.course.toLowerCase()) &&
        (!filters.year || (s.year || '').toLowerCase() === filters.year.toLowerCase()) &&
        (!filters.company || company.toLowerCase().includes(filters.company.toLowerCase())) &&
        (!filters.mentor || mentor.toLowerCase().includes(filters.mentor.toLowerCase())) &&
        (!filters.status ||
          (filters.status === 'active' && status === 'active') ||
          (filters.status === 'completed' && status === 'completed') ||
          (filters.status === 'missing' && status === 'missing'))
      );
    };
    return students.filter(searchMatched);
  }, [students, query, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const compare = (a, b) => {
      const getVal = (s) => {
        if (sortKey === 'name') return `${s.firstName} ${s.lastName}`.toLowerCase();
        if (sortKey === 'email') return (s.email || '').toLowerCase();
        if (sortKey === 'course') return (s.course || '').toLowerCase();
        if (sortKey === 'year') return (s.year || '').toLowerCase();
        if (sortKey === 'company') return (s.trainingDetails?.agencyName || '').toLowerCase();
        if (sortKey === 'mentor') return (s.trainingDetails?.mentor || '').toLowerCase();
        if (sortKey === 'status') {
          return (!s.trainingDetails || !s.trainingDetails.agencyName || !s.trainingDetails.mentor)
            ? 'missing'
            : (s.trainingDetails.status || 'active');
        }
        return '';
      };
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    arr.sort(compare);
    return arr;
  }, [filtered, sortKey, sortDir]);

  const paginated = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return { rows: sorted.slice(start, end), totalPages, currentPage };
  }, [sorted, page, pageSize]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Course', 'Year', 'Company', 'Mentor', 'Status'];
    const rows = sorted.map(s => {
      const status =
        !s.trainingDetails || !s.trainingDetails.agencyName || !s.trainingDetails.mentor
          ? 'Missing Details'
          : (s.trainingDetails.status || 'Active');
      return [
        `${s.firstName} ${s.lastName}`,
        s.email || '',
        s.course || '',
        s.year || '',
        s.trainingDetails?.agencyName || '',
        s.trainingDetails?.mentor || '',
        status
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) return;
    const view = { name, filters, sortKey, sortDir, pageSize };
    const next = [...savedViews.filter(v => v.name !== name), view];
    setSavedViews(next);
    localStorage.setItem('admin_saved_views', JSON.stringify(next));
    setSelectedView(name);
    setNewViewName('');
  };

  const loadView = (name) => {
    const v = savedViews.find(x => x.name === name);
    if (!v) return;
    setFilters(v.filters);
    setSortKey(v.sortKey);
    setSortDir(v.sortDir);
    setPageSize(v.pageSize);
    setPage(1);
    setSelectedView(name);
  };

  const deleteView = (name) => {
    const next = savedViews.filter(v => v.name !== name);
    setSavedViews(next);
    localStorage.setItem('admin_saved_views', JSON.stringify(next));
    if (selectedView === name) setSelectedView('');
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
  if (error) return (
    <div className="p-4 text-red-500 bg-red-100 rounded-lg">{error}</div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 mb-8 text-white shadow-lg flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-sm opacity-90 mt-1">Overview of students and training progress</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition font-medium border border-white/10"
        >
          Logout
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow p-4 flex items-center">
          <div className="p-3 rounded-lg bg-blue-100 text-blue-600 mr-4"><FaUsers /></div>
          <div>
            <div className="text-sm text-gray-500">Students</div>
            <div className="text-2xl font-semibold text-gray-800">{stats.totalStudents}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 flex items-center">
          <div className="p-3 rounded-lg bg-green-100 text-green-600 mr-4"><FaBuilding /></div>
          <div>
            <div className="text-sm text-gray-500">Active Trainings</div>
            <div className="text-2xl font-semibold text-gray-800">{stats.activeTrainings}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 flex items-center">
          <div className="p-3 rounded-lg bg-yellow-100 text-yellow-600 mr-4"><FaClipboardList /></div>
          <div>
            <div className="text-sm text-gray-500">Daily Logs</div>
            <div className="text-2xl font-semibold text-gray-800">{stats.totalLogs}</div>
          </div>
        </div>

      </div>

      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, course, company, mentor..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-gray-600">Course</label>
            <select
              value={filters.course}
              onChange={(e) => setFilters({ ...filters, course: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              {Array.from(new Set(students.map(s => s.course).filter(Boolean))).sort().map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">Year</label>
            <select
              value={filters.year}
              onChange={(e) => setFilters({ ...filters, year: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              {['1','2','3','4'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="missing">Missing Details</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">Company</label>
            <input
              value={filters.company}
              onChange={(e) => setFilters({ ...filters, company: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Filter by company"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Mentor</label>
            <input
              value={filters.mentor}
              onChange={(e) => setFilters({ ...filters, mentor: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Filter by mentor"
            />
          </div>
          <div className="flex items-end space-x-2">
            <button
              onClick={exportCSV}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Export CSV
            </button>
            <select
              value={selectedView}
              onChange={(e) => loadView(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Saved Views</option>
              {savedViews.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
            {selectedView && (
              <button
                onClick={() => deleteView(selectedView)}
                className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            )}
          </div>
          <div className="md:col-span-3 flex items-end space-x-2">
            <input
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="Name this view"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <button
              onClick={saveCurrentView}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Save View
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th onClick={() => toggleSort('name')} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer">Name</th>
                <th onClick={() => toggleSort('email')} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer">Email</th>
                <th onClick={() => toggleSort('course')} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer">Course</th>
                <th onClick={() => toggleSort('year')} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer">Year</th>
                <th onClick={() => toggleSort('company')} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer">Company</th>
                <th onClick={() => toggleSort('mentor')} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer">Mentor</th>
                <th onClick={() => toggleSort('status')} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginated.rows.map(student => {
                const status =
                  !student.trainingDetails || !student.trainingDetails.agencyName || !student.trainingDetails.mentor
                    ? 'Missing Details'
                    : (student.trainingDetails.status || 'Active');
                const statusClass =
                  status === 'Active'
                    ? 'bg-green-100 text-green-700'
                    : status === 'Completed'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-red-100 text-red-700';
                return (
                <tr key={student._id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDrawerStudent(student)}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0">
                        <div className="h-full w-full rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                          {student.firstName[0]}{student.lastName[0]}
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {student.firstName} {student.lastName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.course}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.year}</td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                      {student.trainingDetails?.agencyName || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                      {student.trainingDetails?.mentor || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full ${statusClass}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-600">
          Page {paginated.currentPage} of {paginated.totalPages}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Prev
          </button>
          <button
            onClick={() => setPage(Math.min(paginated.totalPages, page + 1))}
            className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Next
          </button>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {drawerStudent && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black bg-opacity-30" onClick={() => setDrawerStudent(null)}></div>
          <div className="absolute right-0 top-0 h-full w-full sm:w-96 bg-white shadow-xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-lg font-semibold text-gray-800">{drawerStudent.firstName} {drawerStudent.lastName}</div>
                <div className="text-sm text-gray-500">{drawerStudent.email}</div>
              </div>
              <button
                onClick={() => setDrawerStudent(null)}
                className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-600">Company</div>
                  <div className="font-medium">{drawerStudent.trainingDetails?.agencyName || 'N/A'}</div>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-600">Mentor</div>
                  <div className="font-medium">{drawerStudent.trainingDetails?.mentor || 'N/A'}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-600">Course</div>
                  <div className="font-medium">{drawerStudent.course || 'N/A'}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-600">Year</div>
                  <div className="font-medium">{drawerStudent.year || 'N/A'}</div>
                </div>
              </div>
              <div className="bg-white border rounded-lg p-3">
                <div className="text-sm font-semibold text-gray-800 mb-2">Training Summary</div>
                <div className="text-sm text-gray-700">
                  <div>Job Role: {drawerStudent.trainingDetails?.jobRole || 'N/A'}</div>
                  <div>
                    Period: {drawerStudent.trainingDetails?.startDate ? new Date(drawerStudent.trainingDetails.startDate).toLocaleDateString() : 'N/A'}
                    {' '} - {' '}
                    {drawerStudent.trainingDetails?.endDate ? new Date(drawerStudent.trainingDetails.endDate).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
              </div>
              <div className="bg-white border rounded-lg p-3">
                <div className="text-sm font-semibold text-gray-800 mb-2">Latest Daily Log</div>
                <div className="text-sm text-gray-700">
                  {drawerStudent.dailyLogs && drawerStudent.dailyLogs.length > 0 ? (
                    (() => {
                      let latest = null;
                      try {
                        latest = [...drawerStudent.dailyLogs].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                      } catch (e) {
                        console.error('Error sorting daily logs:', e);
                      }
                      
                      if (!latest) return <div>No logs available</div>;

                      // Safe extraction of tasks, hours, and notes
                      const tasksArray = Array.isArray(latest.tasks) ? latest.tasks : [];
                      const totalHoursVal = latest.totalHours !== undefined ? latest.totalHours : (latest.hours || 'N/A');

                      return (
                        <div className="space-y-2">
                          <div><strong>Date:</strong> {latest.date ? new Date(latest.date).toLocaleDateString() : 'N/A'}</div>
                          <div><strong>Total Hours:</strong> {totalHoursVal}</div>
                          <div>
                            <strong>Tasks:</strong>
                            {tasksArray.length > 0 ? (
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                {tasksArray.map((t, idx) => (
                                  <li key={idx} className="text-xs text-gray-600">
                                    {t.description || 'No description'} {t.hours !== undefined ? `(${t.hours} hrs)` : ''}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-gray-500 text-xs ml-1">None logged</span>
                            )}
                          </div>
                          <div><strong>Notes:</strong> {latest.notes || 'N/A'}</div>
                        </div>
                      );
                    })()
                  ) : (
                    <div>No logs available</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
