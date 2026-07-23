import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '../DashboardLayout';
import {
  getAdminOverview,
  getAdminStudents,
  getAdminStudentDetail,
  getAdminInternships,
  getAdminFaculty,
  getAdminMentors,
  getAdminAcademicStructure,
  getAuditLogs
} from '../../../services/adminV2Service';
import {
  FaUsers,
  FaBuilding,
  FaClipboardList,
  FaFileAlt,
  FaChalkboardTeacher,
  FaUserTie,
  FaSitemap,
  FaSearch,
  FaTimes,
  FaChevronRight,
  FaPlus,
  FaHome,
  FaShieldAlt
} from 'react-icons/fa';
import {
  createDepartment,
  createProgram,
  createBatch,
  getAdminCompanies,
  createCompany,
  provisionStudent,
  provisionFaculty,
  provisionMentor,
  createInternship
} from '../../../services/adminV2Service';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditTableFilter, setAuditTableFilter] = useState('');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchAuditLogs = useCallback(async (page = 1) => {
    setAuditLoading(true);
    try {
      const params = { page, limit: 10 };
      if (auditActionFilter) params.action = auditActionFilter;
      if (auditTableFilter) params.target_table = auditTableFilter;
      if (auditStartDate) params.start_date = auditStartDate;
      if (auditEndDate) params.end_date = auditEndDate;

      const res = await getAuditLogs(params);
      setAuditLogs(res.data || []);
      setAuditPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Fetch Audit Logs Error:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [auditActionFilter, auditTableFilter, auditStartDate, auditEndDate]);

  useEffect(() => {
    if (activeTab === 'audit-logs') {
      fetchAuditLogs(1);
    }
  }, [activeTab, fetchAuditLogs]);

  // Overview state
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);


  // Students state
  const [students, setStudents] = useState([]);
  const [studentsPagination, setStudentsPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);

  // Internships state
  const [internships, setInternships] = useState([]);
  const [internshipsPagination, setInternshipsPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [internshipsLoading, setInternshipsLoading] = useState(false);
  const [internshipSearch, setInternshipSearch] = useState('');
  const [internshipStatusFilter, setInternshipStatusFilter] = useState('all');

  // Faculty state
  const [faculty, setFaculty] = useState([]);
  const [facultyLoading, setFacultyLoading] = useState(false);

  // Mentors state
  const [mentors, setMentors] = useState([]);
  const [mentorsLoading, setMentorsLoading] = useState(false);

  // Companies state
  const [companies, setCompanies] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  // Academic Structure state
  const [academicStructure, setAcademicStructure] = useState([]);
  const [structureLoading, setStructureLoading] = useState(false);

  // Global Alerts state
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal visibility states
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptName, setDeptName] = useState('');

  const [showProgModal, setShowProgModal] = useState(false);
  const [progDeptId, setProgDeptId] = useState('');
  const [progName, setProgName] = useState('');

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchProgId, setBatchProgId] = useState('');
  const [batchName, setBatchName] = useState('');

  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [stuEmail, setStuEmail] = useState('');
  const [stuFirstName, setStuFirstName] = useState('');
  const [stuLastName, setStuLastName] = useState('');
  const [stuIdNum, setStuIdNum] = useState('');
  const [stuBatchId, setStuBatchId] = useState('');

  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [facEmail, setFacEmail] = useState('');
  const [facFirstName, setFacFirstName] = useState('');
  const [facLastName, setFacLastName] = useState('');

  const [showMentorModal, setShowMentorModal] = useState(false);
  const [menEmail, setMenEmail] = useState('');
  const [menFirstName, setMenFirstName] = useState('');
  const [menLastName, setMenLastName] = useState('');

  const [showInternshipModal, setShowInternshipModal] = useState(false);
  const [intStudentId, setIntStudentId] = useState('');
  const [intCompanyId, setIntCompanyId] = useState('');
  const [intJobRole, setIntJobRole] = useState('');
  const [intStartDate, setIntStartDate] = useState('');
  const [intEndDate, setIntEndDate] = useState('');
  const [intHours, setIntHours] = useState(150);

  const [submittingModal, setSubmittingModal] = useState(false);

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    setErrorMsg('');
    try {
      const res = await getAdminOverview();
      setOverview(res.data);
    } catch (err) {
      console.error('Error fetching admin overview:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load Admin overview');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchStudents = useCallback(async (page = 1, search = '') => {
    setStudentsLoading(true);
    try {
      const res = await getAdminStudents({ page, limit: 10, search });
      setStudents(res.data || []);
      setStudentsPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Error fetching admin students:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load students');
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const fetchStudentDetail = async (studentId) => {
    setStudentDetailLoading(true);
    try {
      const res = await getAdminStudentDetail(studentId);
      setSelectedStudentDetail(res.data);
    } catch (err) {
      console.error('Error fetching student detail:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load student detail');
    } finally {
      setStudentDetailLoading(false);
    }
  };

  const fetchInternships = useCallback(async (page = 1, search = '', status = 'all') => {
    setInternshipsLoading(true);
    try {
      const res = await getAdminInternships({ page, limit: 10, search, status });
      setInternships(res.data || []);
      setInternshipsPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Error fetching admin internships:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load internships');
    } finally {
      setInternshipsLoading(false);
    }
  }, []);

  const fetchFaculty = useCallback(async () => {
    setFacultyLoading(true);
    try {
      const res = await getAdminFaculty();
      setFaculty(res.data || []);
    } catch (err) {
      console.error('Error fetching admin faculty:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load faculty');
    } finally {
      setFacultyLoading(false);
    }
  }, []);

  const fetchMentors = useCallback(async () => {
    setMentorsLoading(true);
    try {
      const res = await getAdminMentors();
      setMentors(res.data || []);
    } catch (err) {
      console.error('Error fetching admin mentors:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load mentors');
    } finally {
      setMentorsLoading(false);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    setCompaniesLoading(true);
    try {
      const res = await getAdminCompanies();
      setCompanies(res.data || []);
    } catch (err) {
      console.error('Error fetching admin companies:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load companies');
    } finally {
      setCompaniesLoading(false);
    }
  }, []);

  const fetchAcademicStructure = useCallback(async () => {
    setStructureLoading(true);
    try {
      const res = await getAdminAcademicStructure();
      setAcademicStructure(res.data || []);
    } catch (err) {
      console.error('Error fetching academic structure:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load academic structure');
    } finally {
      setStructureLoading(false);
    }
  }, []);

  // ── Initial Load & Tab Switching ──────────────────────────────────────────
  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'students') {
      fetchStudents(1, studentSearch);
    } else if (activeTab === 'internships') {
      fetchInternships(1, internshipSearch, internshipStatusFilter);
    } else if (activeTab === 'faculty') {
      fetchFaculty();
    } else if (activeTab === 'mentors') {
      fetchMentors();
    } else if (activeTab === 'companies') {
      fetchCompanies();
    } else if (activeTab === 'structure') {
      fetchAcademicStructure();
    }
  }, [activeTab, fetchStudents, fetchInternships, fetchFaculty, fetchMentors, fetchCompanies, fetchAcademicStructure, studentSearch, internshipSearch, internshipStatusFilter]);

  // ── Mutation Handlers ─────────────────────────────────────────────────────
  const handleCreateDept = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await createDepartment({ name: deptName });
      setSuccessMsg('Department created successfully!');
      setShowDeptModal(false);
      setDeptName('');
      fetchAcademicStructure();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to create department');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleCreateProg = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await createProgram({ department_id: progDeptId, name: progName });
      setSuccessMsg('Program created successfully!');
      setShowProgModal(false);
      setProgDeptId('');
      setProgName('');
      fetchAcademicStructure();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to create program');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await createBatch({ program_id: batchProgId, name: batchName });
      setSuccessMsg('Batch created successfully!');
      setShowBatchModal(false);
      setBatchProgId('');
      setBatchName('');
      fetchAcademicStructure();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to create batch');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await createCompany({ name: companyName, website: companyWebsite });
      setSuccessMsg('Company created successfully!');
      setShowCompanyModal(false);
      setCompanyName('');
      setCompanyWebsite('');
      fetchCompanies();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to create company');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleProvisionStudent = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await provisionStudent({
        email: stuEmail,
        first_name: stuFirstName,
        last_name: stuLastName,
        student_id_number: stuIdNum,
        batch_id: stuBatchId
      });
      setSuccessMsg('Student provisioned successfully!');
      setShowStudentModal(false);
      setStuEmail(''); setStuFirstName(''); setStuLastName(''); setStuIdNum(''); setStuBatchId('');
      fetchStudents(1, studentSearch);
      fetchOverview();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to provision student');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleProvisionFaculty = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await provisionFaculty({
        email: facEmail,
        first_name: facFirstName,
        last_name: facLastName
      });
      setSuccessMsg('Faculty Advisor provisioned successfully!');
      setShowFacultyModal(false);
      setFacEmail(''); setFacFirstName(''); setFacLastName('');
      fetchFaculty();
      fetchOverview();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to provision faculty');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleProvisionMentor = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await provisionMentor({
        email: menEmail,
        first_name: menFirstName,
        last_name: menLastName
      });
      setSuccessMsg('Company Mentor provisioned successfully!');
      setShowMentorModal(false);
      setMenEmail(''); setMenFirstName(''); setMenLastName('');
      fetchMentors();
      fetchOverview();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to provision mentor');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleCreateInternship = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await createInternship({
        student_id: intStudentId,
        company_id: intCompanyId,
        job_role: intJobRole,
        start_date: intStartDate,
        end_date: intEndDate,
        total_hours: parseInt(intHours, 10),
        status: 'ACTIVE'
      });
      setSuccessMsg('Internship created successfully!');
      setShowInternshipModal(false);
      setIntStudentId(''); setIntCompanyId(''); setIntJobRole(''); setIntStartDate(''); setIntEndDate(''); setIntHours(150);
      fetchInternships(1, internshipSearch, internshipStatusFilter);
      fetchOverview();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to create internship');
    } finally {
      setSubmittingModal(false);
    }
  };

  return (
    <DashboardLayout userRole="admin">
      <div className="max-w-7xl mx-auto">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 rounded-2xl p-6 mb-8 text-white shadow-xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider px-3 py-1 bg-white/20 rounded-full">
                {overview?.tenant_name || 'Tenant Admin Workspace'}
              </span>
              <h1 className="text-3xl font-extrabold mt-2">Tenant Administration Dashboard</h1>
              <p className="text-sm opacity-90 mt-1">
                Manage students, internships, faculty advisors, company mentors, and academic structures.
              </p>
            </div>
          </div>
        </div>

        {/* Global Success Notice */}
        {successMsg && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-r-xl text-green-700 text-sm flex justify-between items-center">
            <div><strong>Success:</strong> {successMsg}</div>
            <button onClick={() => setSuccessMsg('')} className="text-green-500 hover:text-green-700">
              <FaTimes />
            </button>
          </div>
        )}

        {/* Global Error Notice */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl text-red-700 text-sm flex justify-between items-center">
            <div><strong>Error:</strong> {errorMsg}</div>
            <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-700">
              <FaTimes />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: FaHome },
            { id: 'students', label: 'Students', icon: FaUsers },
            { id: 'internships', label: 'Internships', icon: FaBuilding },
            { id: 'faculty', label: 'Faculty Advisors', icon: FaChalkboardTeacher },
            { id: 'mentors', label: 'Company Mentors', icon: FaUserTie },
            { id: 'companies', label: 'Companies', icon: FaBuilding },
            { id: 'structure', label: 'Academic Structure', icon: FaSitemap },
            { id: 'audit-logs', label: 'Audit Logs', icon: FaShieldAlt }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setErrorMsg(''); setSuccessMsg(''); }}
                className={`flex items-center px-5 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="mr-2 text-base" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            {overviewLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-bold text-gray-400">Total Enrolled Students</div>
                      <div className="text-3xl font-extrabold text-gray-800 mt-2">{overview?.total_students || 0}</div>
                    </div>
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-xl text-2xl"><FaUsers /></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-bold text-gray-400">Active Internships</div>
                      <div className="text-3xl font-extrabold text-gray-800 mt-2">{overview?.active_internships || 0}</div>
                    </div>
                    <div className="p-4 bg-green-50 text-green-600 rounded-xl text-2xl"><FaBuilding /></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-bold text-gray-400">Company Mentors</div>
                      <div className="text-3xl font-extrabold text-gray-800 mt-2">{overview?.company_mentors || 0}</div>
                    </div>
                    <div className="p-4 bg-purple-50 text-purple-600 rounded-xl text-2xl"><FaUserTie /></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-indigo-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-bold text-gray-400">Faculty Advisors</div>
                      <div className="text-3xl font-extrabold text-gray-800 mt-2">{overview?.faculty_mentors || 0}</div>
                    </div>
                    <div className="p-4 bg-indigo-50 text-indigo-600 rounded-xl text-2xl"><FaChalkboardTeacher /></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-amber-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-bold text-gray-400">Pending Daily Logs</div>
                      <div className="text-3xl font-extrabold text-gray-800 mt-2">{overview?.pending_daily_logs || 0}</div>
                    </div>
                    <div className="p-4 bg-amber-50 text-amber-600 rounded-xl text-2xl"><FaClipboardList /></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-rose-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-bold text-gray-400">Pending Weekly Reports</div>
                      <div className="text-3xl font-extrabold text-gray-800 mt-2">{overview?.pending_weekly_reports || 0}</div>
                    </div>
                    <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-2xl"><FaFileAlt /></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STUDENTS */}
        {activeTab === 'students' && (
          <div>
            <div className="bg-white rounded-xl shadow p-4 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="relative flex-1 w-full">
                <FaSearch className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    fetchStudents(1, e.target.value);
                  }}
                  placeholder="Search students by name, email, or student ID..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => { fetchAcademicStructure(); setShowStudentModal(true); }}
                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow transition-colors whitespace-nowrap"
              >
                <FaPlus className="mr-2" /> Provision Student
              </button>
            </div>

            {studentsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : students.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">
                No students found matching search filters.
              </div>
            ) : (
              <div className="bg-white shadow-md rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-gray-700 font-semibold uppercase text-xs">
                      <tr>
                        <th className="px-6 py-3 text-left">Student Name</th>
                        <th className="px-6 py-3 text-left">Student ID</th>
                        <th className="px-6 py-3 text-left">Program / Batch</th>
                        <th className="px-6 py-3 text-left">Active Company & Role</th>
                        <th className="px-6 py-3 text-left">Hours (Approved / Required)</th>
                        <th className="px-6 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {students.map(s => {
                        const int = s.active_internship;
                        return (
                          <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-semibold text-gray-900">{s.first_name} {s.last_name}</div>
                              <div className="text-xs text-gray-500">{s.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-mono text-xs">{s.student_id_number}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-gray-900 font-medium">{s.program_name}</div>
                              <div className="text-xs text-gray-500">{s.batch_name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {int ? (
                                <div>
                                  <div className="text-gray-900 font-medium">{int.company_name}</div>
                                  <div className="text-xs text-blue-600">{int.job_role}</div>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">No Active Internship</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {int ? (
                                <div>
                                  <span className="font-bold text-green-600">{int.approved_hours.toFixed(1)}h</span>
                                  <span className="text-gray-400"> / {int.required_hours}h</span>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">N/A</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <button
                                onClick={() => fetchStudentDetail(s.id)}
                                className="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold inline-flex items-center"
                              >
                                View Details <FaChevronRight className="ml-1 text-[10px]" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-600">
                  <div>Page {studentsPagination.page} of {studentsPagination.totalPages} ({studentsPagination.total} Total Students)</div>
                  <div className="flex space-x-2">
                    <button
                      disabled={studentsPagination.page <= 1}
                      onClick={() => fetchStudents(studentsPagination.page - 1, studentSearch)}
                      className="px-3 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100"
                    >
                      Previous
                    </button>
                    <button
                      disabled={studentsPagination.page >= studentsPagination.totalPages}
                      onClick={() => fetchStudents(studentsPagination.page + 1, studentSearch)}
                      className="px-3 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INTERNSHIPS */}
        {activeTab === 'internships' && (
          <div>
            <div className="bg-white rounded-xl shadow p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 w-full">
                <div className="relative flex-1 w-full">
                  <FaSearch className="absolute left-3 top-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={internshipSearch}
                    onChange={(e) => {
                      setInternshipSearch(e.target.value);
                      fetchInternships(1, e.target.value, internshipStatusFilter);
                    }}
                    placeholder="Search by student, company, or job role..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <select
                  value={internshipStatusFilter}
                  onChange={(e) => {
                    setInternshipStatusFilter(e.target.value);
                    fetchInternships(1, internshipSearch, e.target.value);
                  }}
                  className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="PENDING">PENDING</option>
                </select>
              </div>

              <button
                onClick={() => { fetchStudents(); fetchCompanies(); setShowInternshipModal(true); }}
                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow transition-colors whitespace-nowrap"
              >
                <FaPlus className="mr-2" /> Create Internship
              </button>
            </div>

            {internshipsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : internships.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">
                No internships found matching search filters.
              </div>
            ) : (
              <div className="bg-white shadow-md rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-gray-700 font-semibold uppercase text-xs">
                      <tr>
                        <th className="px-6 py-3 text-left">Student</th>
                        <th className="px-6 py-3 text-left">Company & Job Role</th>
                        <th className="px-6 py-3 text-left">Period</th>
                        <th className="px-6 py-3 text-left">Status</th>
                        <th className="px-6 py-3 text-left">Logged Hours</th>
                        <th className="px-6 py-3 text-left">Approved Hours</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {internships.map(i => {
                        const statusBadgeClass =
                          i.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : i.status === 'COMPLETED'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800';

                        return (
                          <tr key={i.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-semibold text-gray-900">{i.student.first_name} {i.student.last_name}</div>
                              <div className="text-xs text-gray-500">{i.student.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-gray-900 font-medium">{i.company_name}</div>
                              <div className="text-xs text-blue-600">{i.job_role}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
                              {i.start_date ? new Date(i.start_date).toLocaleDateString() : 'N/A'} - {i.end_date ? new Date(i.end_date).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusBadgeClass}`}>
                                {i.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-700">
                              {i.logged_hours.toFixed(1)}h
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="font-bold text-green-600">{i.approved_hours.toFixed(1)}h</span>
                              <span className="text-gray-400 text-xs"> / {i.required_hours}h</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-600">
                  <div>Page {internshipsPagination.page} of {internshipsPagination.totalPages} ({internshipsPagination.total} Total Internships)</div>
                  <div className="flex space-x-2">
                    <button
                      disabled={internshipsPagination.page <= 1}
                      onClick={() => fetchInternships(internshipsPagination.page - 1, internshipSearch, internshipStatusFilter)}
                      className="px-3 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100"
                    >
                      Previous
                    </button>
                    <button
                      disabled={internshipsPagination.page >= internshipsPagination.totalPages}
                      onClick={() => fetchInternships(internshipsPagination.page + 1, internshipSearch, internshipStatusFilter)}
                      className="px-3 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: FACULTY ADVISORS */}
        {activeTab === 'faculty' && (
          <div>
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setShowFacultyModal(true)}
                className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow transition-colors"
              >
                <FaPlus className="mr-2" /> Provision Faculty Advisor
              </button>
            </div>
            {facultyLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : faculty.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">
                No faculty advisors found in this tenant.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {faculty.map(f => (
                  <div key={f.id} className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                    <div className="flex items-center mb-4">
                      <div className="h-12 w-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg mr-4">
                        {f.first_name[0]}{f.last_name[0]}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-base">{f.first_name} {f.last_name}</div>
                        <div className="text-xs text-gray-500">{f.email}</div>
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <div className="text-xs uppercase font-bold text-gray-400 mb-2">Assigned Academic Batches</div>
                      {f.assigned_batches && f.assigned_batches.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {f.assigned_batches.map(b => (
                            <span key={b.assignment_id || b.batch_id} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold">
                              {b.program_name}: {b.batch_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No batches assigned yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: COMPANY MENTORS */}
        {activeTab === 'mentors' && (
          <div>
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setShowMentorModal(true)}
                className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow transition-colors"
              >
                <FaPlus className="mr-2" /> Provision Company Mentor
              </button>
            </div>
            {mentorsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : mentors.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">
                No company mentors found in this tenant.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {mentors.map(m => (
                  <div key={m.id} className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                    <div className="flex items-center mb-4">
                      <div className="h-12 w-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg mr-4">
                        {m.first_name[0]}{m.last_name[0]}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-base">{m.first_name} {m.last_name}</div>
                        <div className="text-xs text-gray-500">{m.email}</div>
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <div className="text-xs uppercase font-bold text-gray-400 mb-2">Assigned Student Interns</div>
                      {m.assigned_internships && m.assigned_internships.length > 0 ? (
                        <div className="space-y-2">
                          {m.assigned_internships.map(i => (
                            <div key={i.assignment_id || i.internship_id} className="bg-purple-50/50 p-2.5 rounded-lg text-xs flex justify-between items-center">
                              <div>
                                <div className="font-semibold text-purple-900">{i.student.first_name} {i.student.last_name} ({i.student.email})</div>
                                <div className="text-gray-600">{i.company_name} — {i.job_role}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No assigned interns</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: COMPANIES */}
        {activeTab === 'companies' && (
          <div>
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setShowCompanyModal(true)}
                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow transition-colors"
              >
                <FaPlus className="mr-2" /> Add Company
              </button>
            </div>
            {companiesLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : companies.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">
                No companies created yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {companies.map(c => (
                  <div key={c.id} className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                    <div className="font-bold text-gray-900 text-lg">{c.name}</div>
                    {c.website && (
                      <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1 block">
                        {c.website}
                      </a>
                    )}
                    <div className="text-xs text-gray-400 mt-4">Created: {new Date(c.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 7: ACADEMIC STRUCTURE */}
        {activeTab === 'structure' && (
          <div>
            <div className="flex flex-wrap justify-end gap-3 mb-6">
              <button
                onClick={() => setShowDeptModal(true)}
                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow transition-colors"
              >
                <FaPlus className="mr-2" /> Add Department
              </button>
              <button
                onClick={() => setShowProgModal(true)}
                className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow transition-colors"
              >
                <FaPlus className="mr-2" /> Add Program
              </button>
              <button
                onClick={() => setShowBatchModal(true)}
                className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow transition-colors"
              >
                <FaPlus className="mr-2" /> Add Batch
              </button>
            </div>
            {structureLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : academicStructure.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">
                No departments or programs defined for this tenant.
              </div>
            ) : (
              <div className="space-y-6">
                {academicStructure.map(d => (
                  <div key={d.id} className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <FaSitemap className="mr-2 text-blue-600" />
                      Department: {d.name}
                    </h3>

                    {d.programs && d.programs.length > 0 ? (
                      <div className="pl-6 space-y-4 border-l-2 border-blue-100">
                        {d.programs.map(p => (
                          <div key={p.program_id} className="bg-gray-50 rounded-lg p-4">
                            <div className="font-semibold text-gray-800 text-sm mb-2">Program: {p.program_name}</div>
                            {p.batches && p.batches.length > 0 ? (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {p.batches.map(b => (
                                  <span key={b.batch_id} className="px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-md text-xs font-mono">
                                    Batch: {b.batch_name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">No batches created under this program</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic pl-6">No academic programs defined</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 8: AUDIT LOGS */}
        {activeTab === 'audit-logs' && (
          <div>
            {/* Filter Bar */}
            <div className="bg-white rounded-xl shadow-md p-4 mb-6 border border-gray-100 flex flex-wrap gap-4 items-center">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Action Filter</label>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Actions</option>
                  <option value="ADMIN_CREATE_DEPARTMENT">ADMIN_CREATE_DEPARTMENT</option>
                  <option value="ADMIN_UPDATE_DEPARTMENT">ADMIN_UPDATE_DEPARTMENT</option>
                  <option value="ADMIN_CREATE_PROGRAM">ADMIN_CREATE_PROGRAM</option>
                  <option value="ADMIN_UPDATE_PROGRAM">ADMIN_UPDATE_PROGRAM</option>
                  <option value="ADMIN_CREATE_BATCH">ADMIN_CREATE_BATCH</option>
                  <option value="ADMIN_UPDATE_BATCH">ADMIN_UPDATE_BATCH</option>
                  <option value="ADMIN_CREATE_COMPANY">ADMIN_CREATE_COMPANY</option>
                  <option value="ADMIN_UPDATE_COMPANY">ADMIN_UPDATE_COMPANY</option>
                  <option value="ADMIN_PROVISION_STUDENT">ADMIN_PROVISION_STUDENT</option>
                  <option value="ADMIN_PROVISION_FACULTY">ADMIN_PROVISION_FACULTY</option>
                  <option value="ADMIN_PROVISION_MENTOR">ADMIN_PROVISION_MENTOR</option>
                  <option value="ADMIN_ASSIGN_FACULTY_BATCH">ADMIN_ASSIGN_FACULTY_BATCH</option>
                  <option value="ADMIN_REMOVE_FACULTY_BATCH">ADMIN_REMOVE_FACULTY_BATCH</option>
                  <option value="ADMIN_CREATE_INTERNSHIP">ADMIN_CREATE_INTERNSHIP</option>
                  <option value="ADMIN_UPDATE_INTERNSHIP">ADMIN_UPDATE_INTERNSHIP</option>
                  <option value="ADMIN_ASSIGN_MENTOR">ADMIN_ASSIGN_MENTOR</option>
                  <option value="ADMIN_REMOVE_MENTOR">ADMIN_REMOVE_MENTOR</option>
                  <option value="MEMBERSHIP_GRANTED">MEMBERSHIP_GRANTED</option>
                  <option value="LOG_APPROVED">LOG_APPROVED</option>
                  <option value="LOG_CORRECTION_REQUESTED">LOG_CORRECTION_REQUESTED</option>
                  <option value="WEEKLY_REPORT_SUBMITTED">WEEKLY_REPORT_SUBMITTED</option>
                  <option value="WEEKLY_REPORT_APPROVED">WEEKLY_REPORT_APPROVED</option>
                  <option value="WEEKLY_REPORT_CORRECTION_REQUESTED">WEEKLY_REPORT_CORRECTION_REQUESTED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Resource Type</label>
                <select
                  value={auditTableFilter}
                  onChange={(e) => setAuditTableFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Tables</option>
                  <option value="departments">departments</option>
                  <option value="programs">programs</option>
                  <option value="batches">batches</option>
                  <option value="companies">companies</option>
                  <option value="tenant_memberships">tenant_memberships</option>
                  <option value="faculty_batch_assignments">faculty_batch_assignments</option>
                  <option value="internships">internships</option>
                  <option value="internship_mentor_assignments">internship_mentor_assignments</option>
                  <option value="daily_logs">daily_logs</option>
                  <option value="weekly_reports">weekly_reports</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Start Date</label>
                <input
                  type="date"
                  value={auditStartDate}
                  onChange={(e) => setAuditStartDate(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">End Date</label>
                <input
                  type="date"
                  value={auditEndDate}
                  onChange={(e) => setAuditEndDate(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-5 flex items-center gap-2">
                <button
                  onClick={() => {
                    setAuditActionFilter('');
                    setAuditTableFilter('');
                    setAuditStartDate('');
                    setAuditEndDate('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 border rounded-lg hover:bg-gray-50"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Logs Table */}
            {auditLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-12 text-center text-gray-500">
                <FaShieldAlt className="mx-auto text-4xl text-gray-300 mb-3" />
                <p className="font-semibold text-gray-700">No audit logs found</p>
                <p className="text-xs text-gray-400 mt-1">Audit log records created by system and admin operations will appear here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 uppercase text-xs border-b">
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Actor</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Resource Type</th>
                        <th className="py-3 px-4">Target ID</th>
                        <th className="py-3 px-4 text-center">State Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {auditLogs.map((log) => {
                        const isExpanded = expandedLogId === log.id;
                        return (
                          <React.Fragment key={log.id}>
                            <tr className="hover:bg-gray-50/50 transition-colors">
                              <td className="py-3 px-4 text-gray-600 text-xs whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 font-medium text-gray-900">
                                {log.actor ? `${log.actor.first_name || ''} ${log.actor.last_name || ''}`.trim() || log.actor.email : 'System'}
                                {log.actor?.email && <div className="text-xs text-gray-400 font-normal">{log.actor.email}</div>}
                              </td>
                              <td className="py-3 px-4">
                                <span className="inline-block px-2.5 py-1 text-xs font-mono font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-md">
                                  {log.action}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-gray-600 font-mono text-xs">{log.target_table}</td>
                              <td className="py-3 px-4 text-gray-500 font-mono text-xs">{log.target_id}</td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                  className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                >
                                  {isExpanded ? 'Hide Details' : 'View Details'}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-gray-50/80">
                                <td colSpan="6" className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                                    <div>
                                      <div className="font-sans font-bold text-gray-700 mb-1 uppercase tracking-wider text-[10px]">Before State</div>
                                      <pre className="bg-white p-3 rounded-lg border text-gray-700 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                                        {log.before_state ? JSON.stringify(log.before_state, null, 2) : 'null'}
                                      </pre>
                                    </div>
                                    <div>
                                      <div className="font-sans font-bold text-gray-700 mb-1 uppercase tracking-wider text-[10px]">After State</div>
                                      <pre className="bg-white p-3 rounded-lg border text-gray-700 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                                        {log.after_state ? JSON.stringify(log.after_state, null, 2) : 'null'}
                                      </pre>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {auditPagination.totalPages > 1 && (
                  <div className="px-6 py-4 border-t flex items-center justify-between text-xs text-gray-600">
                    <div>Showing Page {auditPagination.page} of {auditPagination.totalPages} ({auditPagination.total} total logs)</div>
                    <div className="flex space-x-2">
                      <button
                        disabled={auditPagination.page <= 1}
                        onClick={() => fetchAuditLogs(auditPagination.page - 1)}
                        className="px-3 py-1.5 border rounded-md font-semibold disabled:opacity-40 hover:bg-gray-50"
                      >
                        Previous
                      </button>
                      <button
                        disabled={auditPagination.page >= auditPagination.totalPages}
                        onClick={() => fetchAuditLogs(auditPagination.page + 1)}
                        className="px-3 py-1.5 border rounded-md font-semibold disabled:opacity-40 hover:bg-gray-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {/* Student Detail Drawer */}
        {selectedStudentDetail && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedStudentDetail(null)}></div>
            <div className="absolute right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-2xl p-6 overflow-y-auto z-10">
              <div className="flex items-center justify-between border-b pb-4 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedStudentDetail.first_name} {selectedStudentDetail.last_name}</h2>
                  <p className="text-xs text-gray-500">{selectedStudentDetail.email}</p>
                </div>
                <button
                  onClick={() => setSelectedStudentDetail(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                >
                  <FaTimes className="text-lg" />
                </button>
              </div>

              {studentDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="space-y-6 text-sm">
                  {/* Academic Identity */}
                  <div className="bg-blue-50/50 p-4 rounded-xl space-y-2">
                    <div className="text-xs uppercase font-bold text-blue-700">Academic Info</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><strong className="text-gray-500">Student ID:</strong> <span className="font-mono">{selectedStudentDetail.student_id_number}</span></div>
                      <div><strong className="text-gray-500">Department:</strong> {selectedStudentDetail.academic_hierarchy.department_name}</div>
                      <div><strong className="text-gray-500">Program:</strong> {selectedStudentDetail.academic_hierarchy.program_name}</div>
                      <div><strong className="text-gray-500">Batch:</strong> {selectedStudentDetail.academic_hierarchy.batch_name}</div>
                    </div>
                  </div>

                  {/* Internship History */}
                  <div>
                    <h3 className="font-bold text-gray-900 mb-3 text-base">Internship History</h3>
                    {selectedStudentDetail.internships && selectedStudentDetail.internships.length > 0 ? (
                      <div className="space-y-3">
                        {selectedStudentDetail.internships.map(i => (
                          <div key={i.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="font-bold text-gray-900 text-sm">{i.company_name}</div>
                                <div className="text-xs text-blue-600 font-medium">{i.job_role}</div>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                i.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {i.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 border-t pt-2 mt-2">
                              <div><strong>Logged:</strong> {i.logged_hours.toFixed(1)} hrs</div>
                              <div><strong>Approved:</strong> <span className="text-green-600 font-bold">{i.approved_hours.toFixed(1)} hrs</span></div>
                              <div><strong>Required:</strong> {i.required_hours} hrs</div>
                              <div><strong>Progress:</strong> {Math.min(100, Math.round((i.approved_hours / (i.required_hours || 1)) * 100))}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-gray-400 text-xs italic">No internship records found for this student.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* MODAL 1: ADD DEPARTMENT */}
        {showDeptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Add Department</h3>
                <button onClick={() => setShowDeptModal(false)} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
              </div>
              <form onSubmit={handleCreateDept} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Department Name</label>
                  <input
                    type="text"
                    required
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    placeholder="e.g. Computer Science Department"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowDeptModal(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow disabled:opacity-50">
                    {submittingModal ? 'Saving...' : 'Create Department'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: ADD PROGRAM */}
        {showProgModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Add Program</h3>
                <button onClick={() => setShowProgModal(false)} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
              </div>
              <form onSubmit={handleCreateProg} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Department</label>
                  <select
                    required
                    value={progDeptId}
                    onChange={(e) => setProgDeptId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Department...</option>
                    {academicStructure.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Program Name</label>
                  <input
                    type="text"
                    required
                    value={progName}
                    onChange={(e) => setProgName(e.target.value)}
                    placeholder="e.g. Master of Computer Applications (MCA)"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowProgModal(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow disabled:opacity-50">
                    {submittingModal ? 'Saving...' : 'Create Program'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: ADD BATCH */}
        {showBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Add Academic Batch</h3>
                <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
              </div>
              <form onSubmit={handleCreateBatch} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Program</label>
                  <select
                    required
                    value={batchProgId}
                    onChange={(e) => setBatchProgId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Program...</option>
                    {academicStructure.flatMap(d => d.programs || []).map(p => (
                      <option key={p.program_id} value={p.program_id}>{p.program_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Batch Name</label>
                  <input
                    type="text"
                    required
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="e.g. MCA-2026"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowBatchModal(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow disabled:opacity-50">
                    {submittingModal ? 'Saving...' : 'Create Batch'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: ADD COMPANY */}
        {showCompanyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Add Company</h3>
                <button onClick={() => setShowCompanyModal(false)} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
              </div>
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Company Name</label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Tech Solutions"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Website (Optional)</label>
                  <input
                    type="text"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    placeholder="e.g. https://acmetech.com"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowCompanyModal(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow disabled:opacity-50">
                    {submittingModal ? 'Saving...' : 'Create Company'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 5: PROVISION STUDENT */}
        {showStudentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Provision Student</h3>
                <button onClick={() => setShowStudentModal(false)} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
              </div>
              <form onSubmit={handleProvisionStudent} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={stuEmail}
                    onChange={(e) => setStuEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">First Name</label>
                    <input
                      type="text"
                      required
                      value={stuFirstName}
                      onChange={(e) => setStuFirstName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Last Name</label>
                    <input
                      type="text"
                      required
                      value={stuLastName}
                      onChange={(e) => setStuLastName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Student ID Number</label>
                  <input
                    type="text"
                    required
                    value={stuIdNum}
                    onChange={(e) => setStuIdNum(e.target.value)}
                    placeholder="e.g. STU-2026-001"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Academic Batch</label>
                  <select
                    required
                    value={stuBatchId}
                    onChange={(e) => setStuBatchId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Batch...</option>
                    {academicStructure.flatMap(d => (d.programs || []).flatMap(p => p.batches || [])).map(b => (
                      <option key={b.batch_id} value={b.batch_id}>{b.batch_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowStudentModal(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow disabled:opacity-50">
                    {submittingModal ? 'Provisioning...' : 'Provision Student'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 6: PROVISION FACULTY */}
        {showFacultyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Provision Faculty Advisor</h3>
                <button onClick={() => setShowFacultyModal(false)} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
              </div>
              <form onSubmit={handleProvisionFaculty} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={facEmail}
                    onChange={(e) => setFacEmail(e.target.value)}
                    placeholder="faculty@example.com"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">First Name</label>
                    <input
                      type="text"
                      required
                      value={facFirstName}
                      onChange={(e) => setFacFirstName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Last Name</label>
                    <input
                      type="text"
                      required
                      value={facLastName}
                      onChange={(e) => setFacLastName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowFacultyModal(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow disabled:opacity-50">
                    {submittingModal ? 'Provisioning...' : 'Provision Faculty'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 7: PROVISION MENTOR */}
        {showMentorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Provision Company Mentor</h3>
                <button onClick={() => setShowMentorModal(false)} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
              </div>
              <form onSubmit={handleProvisionMentor} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={menEmail}
                    onChange={(e) => setMenEmail(e.target.value)}
                    placeholder="mentor@company.com"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">First Name</label>
                    <input
                      type="text"
                      required
                      value={menFirstName}
                      onChange={(e) => setMenFirstName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Last Name</label>
                    <input
                      type="text"
                      required
                      value={menLastName}
                      onChange={(e) => setMenLastName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowMentorModal(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow disabled:opacity-50">
                    {submittingModal ? 'Provisioning...' : 'Provision Mentor'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 8: CREATE INTERNSHIP */}
        {showInternshipModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Create Student Internship</h3>
                <button onClick={() => setShowInternshipModal(false)} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
              </div>
              <form onSubmit={handleCreateInternship} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Student</label>
                  <select
                    required
                    value={intStudentId}
                    onChange={(e) => setIntStudentId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Student...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Company</label>
                  <select
                    required
                    value={intCompanyId}
                    onChange={(e) => setIntCompanyId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Company...</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Job Role / Position</label>
                  <input
                    type="text"
                    required
                    value={intJobRole}
                    onChange={(e) => setIntJobRole(e.target.value)}
                    placeholder="e.g. Software Engineer Intern"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Start Date</label>
                    <input
                      type="date"
                      required
                      value={intStartDate}
                      onChange={(e) => setIntStartDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">End Date</label>
                    <input
                      type="date"
                      required
                      value={intEndDate}
                      onChange={(e) => setIntEndDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Total Required Hours</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={intHours}
                    onChange={(e) => setIntHours(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowInternshipModal(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow disabled:opacity-50">
                    {submittingModal ? 'Creating...' : 'Create Internship'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AdminDashboard;

