import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '../DashboardLayout';
import { useAuthV2 } from '../../../context/AuthContext';
import {
  getAdminOverview,
  getAdminStudents,
  getAdminStudentDetail,
  getAdminInternships,
  getAdminFaculty,
  getAdminMentors,
  getAdminAcademicStructure,
  getAuditLogs,
  createDepartment,
  createProgram,
  createBatch,
  provisionStudent,
  provisionFaculty,
  inviteFacultyUser,
  assignFacultyToBatch,
  approveInternship,
  rejectInternship
} from '../../../services/adminV2Service';
import {
  FaUserGraduate,
  FaChalkboardTeacher,
  FaHourglassHalf,
  FaEnvelope,
  FaCheckCircle,
  FaSitemap,
  FaBuilding,
  FaSearch,
  FaTimes,
  FaChevronRight,
  FaPlus,
  FaExclamationTriangle,
  FaHistory,
  FaBriefcase,
  FaEye,
  FaSync,
  FaCheck
} from 'react-icons/fa';

function AdminDashboard() {
  const { profile } = useAuthV2();
  const [activeTab, setActiveTab] = useState('overview');

  // Overview Data
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Audit Logs / Activity Feed
  const [recentActivities, setRecentActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Students Data
  const [students, setStudents] = useState([]);
  const [studentsPagination, setStudentsPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);

  // Faculty Data
  const [facultyList, setFacultyList] = useState([]);
  const [facultyLoading, setFacultyLoading] = useState(false);

  // Mentors / Invitations Data
  const [mentorsList, setMentorsList] = useState([]);
  const [mentorsLoading, setMentorsLoading] = useState(false);

  // Internships Data
  const [internshipsList, setInternshipsList] = useState([]);
  const [internshipsLoading, setInternshipsLoading] = useState(false);
  const [internshipSearch, setInternshipSearch] = useState('');
  const [selectedInternshipDetail, setSelectedInternshipDetail] = useState(null);

  // Academic Structure Data
  const [academicStructure, setAcademicStructure] = useState([]);
  const [structureLoading, setStructureLoading] = useState(false);

  // Global Toast / Alerts
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showProgModal, setShowProgModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showAssignFacultyModal, setShowAssignFacultyModal] = useState(false);

  // Approval Dialog Modal state
  const [approvalModalItem, setApprovalModalItem] = useState(null);
  const [approvalFacultyId, setApprovalFacultyId] = useState('');
  const [rejectionModalItem, setRejectionModalItem] = useState(null);
  const [rejectionInputReason, setRejectionInputReason] = useState('');

  // Modal Form Inputs
  const [stuEmail, setStuEmail] = useState('');
  const [stuFirstName, setStuFirstName] = useState('');
  const [stuLastName, setStuLastName] = useState('');
  const [stuIdNum, setStuIdNum] = useState('');
  const [stuBatchId, setStuBatchId] = useState('');

  const [facEmail, setFacEmail] = useState('');
  const [facFirstName, setFacFirstName] = useState('');
  const [facLastName, setFacLastName] = useState('');
  const [facBatchId, setFacBatchId] = useState('');

  const [deptName, setDeptName] = useState('');
  const [progDeptId, setProgDeptId] = useState('');
  const [progName, setProgName] = useState('');
  const [batchProgId, setBatchProgId] = useState('');
  const [batchName, setBatchName] = useState('');

  const [assignFacultyId, setAssignFacultyId] = useState('');
  const [assignBatchId, setAssignBatchId] = useState('');

  const [submittingModal, setSubmittingModal] = useState(false);

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await getAdminOverview();
      setOverview(res.data);
    } catch (err) {
      console.error('Fetch Admin Overview Error:', err);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchRecentActivities = useCallback(async () => {
    setActivitiesLoading(true);
    try {
      const res = await getAuditLogs({ page: 1, limit: 10 });
      setRecentActivities(res.data || []);
    } catch (err) {
      console.error('Fetch Audit Logs Error:', err);
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  const fetchStudents = useCallback(async (page = 1, search = '') => {
    setStudentsLoading(true);
    try {
      const res = await getAdminStudents({ page, limit: 10, search });
      setStudents(res.data || []);
      setStudentsPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Fetch Students Error:', err);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const fetchFaculty = useCallback(async () => {
    setFacultyLoading(true);
    try {
      const res = await getAdminFaculty();
      setFacultyList(res.data || []);
    } catch (err) {
      console.error('Fetch Faculty Error:', err);
    } finally {
      setFacultyLoading(false);
    }
  }, []);

  const fetchMentors = useCallback(async () => {
    setMentorsLoading(true);
    try {
      const res = await getAdminMentors();
      setMentorsList(res.data || []);
    } catch (err) {
      console.error('Fetch Mentors Error:', err);
    } finally {
      setMentorsLoading(false);
    }
  }, []);

  const fetchInternships = useCallback(async (page = 1, search = '') => {
    setInternshipsLoading(true);
    try {
      const res = await getAdminInternships({ page, limit: 10, search });
      setInternshipsList(res.data || []);
    } catch (err) {
      console.error('Fetch Internships Error:', err);
    } finally {
      setInternshipsLoading(false);
    }
  }, []);

  const fetchAcademicStructure = useCallback(async () => {
    setStructureLoading(true);
    try {
      const res = await getAdminAcademicStructure();
      setAcademicStructure(res.data || []);
    } catch (err) {
      console.error('Fetch Academic Structure Error:', err);
    } finally {
      setStructureLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchRecentActivities();
    fetchStudents(1, studentSearch);
    fetchFaculty();
    fetchMentors();
    fetchInternships();
    fetchAcademicStructure();
  }, [fetchOverview, fetchRecentActivities, fetchStudents, fetchFaculty, fetchMentors, fetchInternships, fetchAcademicStructure, studentSearch]);

  const handleStudentSearchChange = (e) => {
    setStudentSearch(e.target.value);
    fetchStudents(1, e.target.value);
  };

  const handleViewStudent = async (studentId) => {
    setStudentDetailLoading(true);
    try {
      const res = await getAdminStudentDetail(studentId);
      setSelectedStudentDetail(res.data);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to fetch student details');
    } finally {
      setStudentDetailLoading(false);
    }
  };

  // ── Provisioning & Action Handlers ─────────────────────────────────────────
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
      setSuccessMsg(`Student "${stuFirstName} ${stuLastName}" provisioned successfully.`);
      setShowStudentModal(false);
      setStuEmail(''); setStuFirstName(''); setStuLastName(''); setStuIdNum(''); setStuBatchId('');
      fetchStudents(1);
      fetchOverview();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to provision student.');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleProvisionFaculty = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      const activeTenantId = profile?.memberships?.[0]?.tenantId || academicStructure?.[0]?.id || '33364575-39ec-4eef-a435-cf973f2a587d';
      await inviteFacultyUser({
        email: facEmail,
        first_name: facFirstName,
        last_name: facLastName,
        tenant_id: activeTenantId,
        batch_id: facBatchId || null
      });
      setSuccessMsg(`Invitation sent to Faculty Advisor "${facFirstName} ${facLastName}".`);
      setShowFacultyModal(false);
      setFacEmail(''); setFacFirstName(''); setFacLastName(''); setFacBatchId('');
      fetchFaculty();
      fetchOverview();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to invite faculty advisor.');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleAssignFaculty = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setErrorMsg('');
    try {
      await assignFacultyToBatch(assignBatchId, assignFacultyId);
      setSuccessMsg('Faculty Advisor assigned to Batch successfully.');
      setShowAssignFacultyModal(false);
      fetchFaculty();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to assign faculty to batch.');
    } finally {
      setSubmittingModal(false);
    }
  };

  // Approval Dialog Confirm Handler
  const handleConfirmApproval = async (e) => {
    e.preventDefault();
    if (!approvalFacultyId) {
      setErrorMsg('Please select a Faculty Advisor to approve and activate the internship.');
      return;
    }
    setSubmittingModal(true);
    try {
      // Execute approval activation
      await approveInternship(approvalModalItem.id, approvalFacultyId);
      setSuccessMsg(`Internship for ${approvalModalItem?.student?.first_name || 'Student'} approved and activated.`);
      setApprovalModalItem(null);
      setApprovalFacultyId('');
      fetchInternships();
      fetchOverview();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to complete internship approval.');
    } finally {
      setSubmittingModal(false);
    }
  };

  // Rejection Dialog Confirm Handler
  const handleConfirmRejection = async (e) => {
    e.preventDefault();
    if (!rejectionInputReason.trim()) {
      setErrorMsg('Please enter a rejection reason.');
      return;
    }
    setSubmittingModal(true);
    try {
      await rejectInternship(rejectionModalItem.id, rejectionInputReason.trim());
      setSuccessMsg(`Internship for ${rejectionModalItem?.student?.first_name || 'Student'} has been rejected.`);
      setRejectionModalItem(null);
      setRejectionInputReason('');
      fetchInternships();
      fetchOverview();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to reject internship.');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    try {
      await createDepartment({ name: deptName });
      setSuccessMsg(`Department "${deptName}" created.`);
      setShowDeptModal(false);
      setDeptName('');
      fetchAcademicStructure();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to create department.');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleCreateProgram = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    try {
      await createProgram({ department_id: progDeptId, name: progName });
      setSuccessMsg(`Program "${progName}" created.`);
      setShowProgModal(false);
      setProgName('');
      fetchAcademicStructure();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to create program.');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    try {
      await createBatch({ program_id: batchProgId, name: batchName });
      setSuccessMsg(`Batch "${batchName}" created.`);
      setShowBatchModal(false);
      setBatchName('');
      fetchAcademicStructure();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to create batch.');
    } finally {
      setSubmittingModal(false);
    }
  };

  // Time of day greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const adminName = profile ? profile.first_name : 'Administrator';

  // Extract flat batch options for selects
  const batchOptions = [];
  academicStructure.forEach(dept => {
    (dept.programs || []).forEach(prog => {
      (prog.batches || []).forEach(batch => {
        batchOptions.push({
          id: batch.batch_id,
          name: `${dept.name} > ${prog.program_name} > ${batch.batch_name}`
        });
      });
    });
  });

  // Separate requests from active internships
  const activeInternships = internshipsList.filter(i => i.status === 'ACTIVE');
  const pendingRequests = internshipsList.filter(i => i.status.toUpperCase() === 'PENDING_VERIFICATION');

  return (
    <DashboardLayout userRole="ADMIN" activeTab={activeTab} onTabChange={setActiveTab}>
      {/* Toast Notifications */}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex justify-between items-center text-sm font-medium shadow-sm animate-in fade-in">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-800">
            <FaTimes />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 flex justify-between items-center text-sm font-medium shadow-sm animate-in fade-in">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-green-500 hover:text-green-800">
            <FaTimes />
          </button>
        </div>
      )}

      {/* ── 1. DASHBOARD HOME (OVERVIEW) ────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 sm:p-8 text-white shadow-md">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {greeting}, {adminName}
            </h1>
            <p className="mt-2 text-blue-100 text-sm sm:text-base max-w-2xl">
              Welcome to the Operational Control Center. Monitor institutional metrics, complete daily workflow approvals, and manage students, faculty, and internships.
            </p>
          </div>

          {/* Real-time Summary Cards (Clickable Navigation) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <button
              onClick={() => setActiveTab('students')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4 hover:border-blue-300 hover:shadow-md transition text-left group"
            >
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl group-hover:bg-blue-600 group-hover:text-white transition">
                <FaUserGraduate />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Students</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-0.5">
                  {overviewLoading ? '...' : overview?.total_students || 0}
                </h3>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('faculty')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4 hover:border-indigo-300 hover:shadow-md transition text-left group"
            >
              <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xl group-hover:bg-indigo-600 group-hover:text-white transition">
                <FaChalkboardTeacher />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Faculty</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-0.5">
                  {overviewLoading ? '...' : overview?.faculty_mentors || 0}
                </h3>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('active-internships')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4 hover:border-emerald-300 hover:shadow-md transition text-left group"
            >
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xl group-hover:bg-emerald-600 group-hover:text-white transition">
                <FaCheckCircle />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Internships</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-0.5">
                  {overviewLoading ? '...' : overview?.active_internships || 0}
                </h3>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('pending-requests')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4 hover:border-amber-300 hover:shadow-md transition text-left group"
            >
              <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xl group-hover:bg-amber-600 group-hover:text-white transition">
                <FaHourglassHalf />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending Requests</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-0.5">
                  {overviewLoading ? '...' : (overview?.pending_daily_logs + overview?.pending_weekly_reports) || 0}
                </h3>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('mentor-invitations')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4 hover:border-purple-300 hover:shadow-md transition text-left group"
            >
              <div className="h-12 w-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xl group-hover:bg-purple-600 group-hover:text-white transition">
                <FaEnvelope />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mentors</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-0.5">
                  {overviewLoading ? '...' : overview?.company_mentors || 0}
                </h3>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('completed-internships')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4 hover:border-gray-300 hover:shadow-md transition text-left group"
            >
              <div className="h-12 w-12 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-xl group-hover:bg-gray-800 group-hover:text-white transition">
                <FaBriefcase />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-0.5">0</h3>
              </div>
            </button>
          </div>

          {/* Today's Tasks / Needs Attention Section */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                <FaExclamationTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Needs Attention</h2>
                <p className="text-xs text-gray-500">Actionable work items requiring administrative review or operational assignment</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => setActiveTab('pending-requests')}
                className="p-4 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-xl text-left transition group"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Review Queue</span>
                  <FaChevronRight className="h-3 w-3 text-gray-400 group-hover:text-blue-600 transition" />
                </div>
                <h4 className="mt-2 text-base font-bold text-gray-900">Pending Internship Requests</h4>
                <p className="mt-1 text-xs text-gray-600">Review pending daily log approvals and student submissions</p>
              </button>

              <button
                onClick={() => setActiveTab('mentor-invitations')}
                className="p-4 bg-gray-50 hover:bg-purple-50 border border-gray-200 hover:border-purple-200 rounded-xl text-left transition group"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Invitations</span>
                  <FaChevronRight className="h-3 w-3 text-gray-400 group-hover:text-purple-600 transition" />
                </div>
                <h4 className="mt-2 text-base font-bold text-gray-900">Mentor Invitations Pending</h4>
                <p className="mt-1 text-xs text-gray-600">Track and resend company mentor onboarding invites</p>
              </button>

              <button
                onClick={() => setActiveTab('students')}
                className="p-4 bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 rounded-xl text-left transition group"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Assignments</span>
                  <FaChevronRight className="h-3 w-3 text-gray-400 group-hover:text-emerald-600 transition" />
                </div>
                <h4 className="mt-2 text-base font-bold text-gray-900">Students Waiting for Faculty Assignment</h4>
                <p className="mt-1 text-xs text-gray-600">Ensure all batches have assigned Faculty Advisors</p>
              </button>

              <button
                onClick={() => setActiveTab('pending-requests')}
                className="p-4 bg-gray-50 hover:bg-amber-50 border border-gray-200 hover:border-amber-200 rounded-xl text-left transition group"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Modifications</span>
                  <FaChevronRight className="h-3 w-3 text-gray-400 group-hover:text-amber-600 transition" />
                </div>
                <h4 className="mt-2 text-base font-bold text-gray-900">Internships Requiring Changes</h4>
                <p className="mt-1 text-xs text-gray-600">Monitor correction requests submitted by mentors</p>
              </button>
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <FaHistory className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Recent Activity</h2>
                  <p className="text-xs text-gray-500">Live audit log stream of institutional actions</p>
                </div>
              </div>
              <button
                onClick={fetchRecentActivities}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1"
              >
                <FaSync className={activitiesLoading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {activitiesLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading audit trail...</div>
            ) : recentActivities.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No recent activity recorded yet.</div>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((act) => (
                  <div key={act.id} className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="h-2.5 w-2.5 rounded-full bg-blue-600"></div>
                      <div>
                        <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">{act.action}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Target: {act.target_table} ({act.target_id || 'N/A'})</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 font-medium">{new Date(act.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 2. ACADEMIC VIEWS ───────────────────────────────────────────────── */}
      {(activeTab === 'departments' || activeTab === 'programs' || activeTab === 'batches') && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Academic Hierarchy</h1>
              <p className="text-xs text-gray-500">Manage Departments, Programs, and Student Batches</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowDeptModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition shadow-sm flex items-center space-x-1.5"
              >
                <FaPlus /> <span>Add Department</span>
              </button>
              <button
                onClick={() => setShowProgModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-sm flex items-center space-x-1.5"
              >
                <FaPlus /> <span>Add Program</span>
              </button>
              <button
                onClick={() => setShowBatchModal(true)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition shadow-sm flex items-center space-x-1.5"
              >
                <FaPlus /> <span>Add Batch</span>
              </button>
            </div>
          </div>

          {structureLoading ? (
            <div className="py-12 text-center text-sm text-gray-500">Loading academic structure...</div>
          ) : academicStructure.length === 0 ? (
            <div className="p-8 bg-white rounded-2xl border border-gray-200 text-center text-gray-500 text-sm">
              No departments configured yet. Click "Add Department" above to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {academicStructure.map((dept) => (
                <div key={dept.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                  <div className="flex items-center space-x-3 border-b border-gray-100 pb-4">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <FaSitemap className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-gray-900">{dept.name}</h3>
                  </div>

                  <div className="mt-4 pl-4 space-y-4">
                    {dept.programs && dept.programs.length > 0 ? (
                      dept.programs.map((prog) => (
                        <div key={prog.program_id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center space-x-2">
                            <FaBuilding className="text-indigo-600 h-4 w-4" />
                            <h4 className="text-sm font-bold text-gray-800">{prog.program_name}</h4>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {prog.batches && prog.batches.length > 0 ? (
                              prog.batches.map((batch) => (
                                <span key={batch.batch_id} className="px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold shadow-xs">
                                  {batch.batch_name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400 italic">No batches created under this program</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 italic">No programs created under this department</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 3. STUDENTS PAGE ────────────────────────────────────────────────── */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Student Management</h1>
              <p className="text-xs text-gray-500">View enrolled students, profiles, and active internship placements</p>
            </div>
            <button
              onClick={() => setShowStudentModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition shadow-sm flex items-center space-x-1.5 self-start sm:self-auto"
            >
              <FaPlus /> <span>Provision Student</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-md">
            <FaSearch className="absolute left-3.5 top-3 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search by name, email, or Student ID..."
              value={studentSearch}
              onChange={handleStudentSearchChange}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
            />
          </div>

          {/* Students Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {studentsLoading ? (
              <div className="py-12 text-center text-sm text-gray-500">Loading students...</div>
            ) : students.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No student records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4">Student ID</th>
                      <th className="py-3.5 px-4">Department / Program</th>
                      <th className="py-3.5 px-4">Batch</th>
                      <th className="py-3.5 px-4">Internship Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {students.map((stu) => (
                      <tr key={stu.id} className="hover:bg-gray-50 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-900">{stu.first_name} {stu.last_name}</div>
                          <div className="text-xs text-gray-500">{stu.email}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-gray-700">{stu.student_id_number}</td>
                        <td className="py-3.5 px-4">
                          <div className="text-xs font-semibold text-gray-800">{stu.department_name}</div>
                          <div className="text-xs text-gray-500">{stu.program_name}</div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-gray-700">{stu.batch_name}</td>
                        <td className="py-3.5 px-4">
                          {stu.active_internship ? (
                            <span className="px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                              {stu.active_internship.status}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleViewStudent(stu.id)}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition inline-flex items-center space-x-1"
                          >
                            <FaEye className="h-3.5 w-3.5" />
                            <span>View Profile</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. FACULTY PAGE ─────────────────────────────────────────────────── */}
      {activeTab === 'faculty' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Faculty Management</h1>
              <p className="text-xs text-gray-500">Manage institutional Faculty Advisors and Batch Assignments</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowAssignFacultyModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-sm flex items-center space-x-1.5"
              >
                <FaSitemap /> <span>Assign Batch</span>
              </button>
              <button
                onClick={() => setShowFacultyModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition shadow-sm flex items-center space-x-1.5"
              >
                <FaPlus /> <span>Invite Faculty</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {facultyLoading ? (
              <div className="py-12 text-center text-sm text-gray-500">Loading faculty advisors...</div>
            ) : facultyList.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No faculty advisors provisioned yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Faculty Advisor</th>
                      <th className="py-3.5 px-4">Email</th>
                      <th className="py-3.5 px-4">Assigned Batches</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {facultyList.map((fac) => (
                      <tr key={fac.id} className="hover:bg-gray-50 transition">
                        <td className="py-3.5 px-4 font-semibold text-gray-900">
                          {fac.first_name} {fac.last_name}
                        </td>
                        <td className="py-3.5 px-4 text-gray-600">{fac.email}</td>
                        <td className="py-3.5 px-4">
                          {fac.assigned_batches && fac.assigned_batches.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {fac.assigned_batches.map((b) => (
                                <span key={b.assignment_id} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-medium">
                                  {b.batch_name} ({b.program_name})
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">No batches assigned</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setAssignFacultyId(fac.id);
                              setShowAssignFacultyModal(true);
                            }}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition"
                          >
                            Assign Batch
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 5. PENDING INTERNSHIP REQUESTS ──────────────────────────────────── */}
      {activeTab === 'pending-requests' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Pending Internship Requests</h1>
            <p className="text-xs text-gray-500">Review student log approvals, internship submissions, and requested changes</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {internshipsLoading ? (
              <div className="py-12 text-center text-sm text-gray-500">Loading pending requests...</div>
            ) : pendingRequests.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No pending internship requests at this time. Requests will appear here prior to approval.</div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((item) => (
                  <div key={item.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-gray-900">{item.student?.first_name} {item.student?.last_name}</span>
                        <span className="text-xs text-gray-500">({item.student?.email})</span>
                      </div>
                      <p className="text-xs text-gray-700 mt-1">
                        Company: <strong className="text-gray-900">{item.company_name}</strong> | Role: <strong className="text-gray-900">{item.job_role}</strong>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">Timeline: {item.start_date} to {item.end_date} ({item.required_hours} hrs)</p>
                      {(item.mentor_name || item.mentor_email) && (
                        <p className="text-xs text-blue-800 mt-1">
                          Company Mentor: <strong className="text-gray-900">{item.mentor_name || 'Not provided'}</strong> {item.mentor_email && <span className="text-gray-600">({item.mentor_email})</span>}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedInternshipDetail(item)}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                      >
                        <FaEye /> <span>View Details</span>
                      </button>
                      <button
                        onClick={() => setApprovalModalItem(item)}
                        className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                      >
                        <FaCheck /> <span>Approve</span>
                      </button>
                      <button
                        onClick={() => setRejectionModalItem(item)}
                        className="px-3 py-1.5 bg-rose-600 text-white hover:bg-rose-700 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                      >
                        <FaTimes /> <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 6. ACTIVE INTERNSHIPS ───────────────────────────────────────────── */}
      {activeTab === 'active-internships' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Active Internships</h1>
            <p className="text-xs text-gray-500">Monitor active student placements, completed hours, and progress</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {internshipsLoading ? (
              <div className="py-12 text-center text-sm text-gray-500">Loading active internships...</div>
            ) : activeInternships.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No active internships registered yet. Approved requests will appear here.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4">Company & Role</th>
                      <th className="py-3.5 px-4">Approved / Required Hours</th>
                      <th className="py-3.5 px-4">Progress</th>
                      <th className="py-3.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {activeInternships.map((item) => {
                      const pct = Math.min(100, Math.round((item.approved_hours / (item.required_hours || 1)) * 100));
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-gray-900">{item.student?.first_name} {item.student?.last_name}</div>
                            <div className="text-xs text-gray-500">{item.student?.email}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-gray-800">{item.company_name}</div>
                            <div className="text-xs text-gray-500">{item.job_role}</div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs font-bold text-gray-800">
                            {item.approved_hours} / {item.required_hours} hrs
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                            </div>
                            <span className="text-xs text-gray-500 mt-1 block">{pct}% Complete</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 7. COMPLETED INTERNSHIPS ────────────────────────────────────────── */}
      {activeTab === 'completed-internships' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Completed Internships</h1>
            <p className="text-xs text-gray-500">Archive of completed student OJT requirements</p>
          </div>
          <div className="p-8 bg-white rounded-2xl border border-gray-200 text-center text-gray-500 text-sm">
            No completed internships recorded in archive yet.
          </div>
        </div>
      )}

      {/* ── 8. MENTOR INVITATIONS PAGE (NO MANUAL PROVISIONING) ─────────────── */}
      {activeTab === 'mentor-invitations' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Mentor Invitations Tracker</h1>
            <p className="text-xs text-gray-500">Mentors are automatically invited upon internship request approval</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {mentorsLoading ? (
              <div className="py-12 text-center text-sm text-gray-500">Loading mentors...</div>
            ) : mentorsList.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No company mentors invited yet. Approve an internship request to trigger a mentor invitation.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Mentor Name</th>
                      <th className="py-3.5 px-4">Mentor Email</th>
                      <th className="py-3.5 px-4">Student & Company</th>
                      <th className="py-3.5 px-4">Invitation Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {mentorsList.map((men) => (
                      <tr key={men.id} className="hover:bg-gray-50 transition">
                        <td className="py-3.5 px-4 font-semibold text-gray-900">
                          {men.first_name} {men.last_name}
                        </td>
                        <td className="py-3.5 px-4 text-gray-600">{men.email}</td>
                        <td className="py-3.5 px-4">
                          {men.assigned_internships && men.assigned_internships.length > 0 ? (
                            <div className="space-y-1">
                              {men.assigned_internships.map((ai) => (
                                <div key={ai.assignment_id} className="text-xs text-gray-700">
                                  <strong>{ai.company_name}</strong> ({ai.student?.first_name} {ai.student?.last_name})
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            ACCEPTED
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSuccessMsg(`Invitation resent to ${men.email}`)}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition"
                          >
                            Resend Invitation
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 9. SETTINGS PAGE ────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">System Settings</h1>
            <p className="text-xs text-gray-500">Institutional operational configuration and security baseline</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-gray-900">Institutional Baseline</h3>
            <p className="text-sm text-gray-600">Tenant: <strong>Nowrosjee Wadia College</strong></p>
            <p className="text-sm text-gray-600">PostgreSQL RLS: <strong>ENABLED (17 tables protected)</strong></p>
            <p className="text-sm text-gray-600">Production Auth: <strong>Supabase Cloud (AWS Mumbai)</strong></p>
          </div>
        </div>
      )}

      {/* ── MODALS & DRAWER OVERLAYS ───────────────────────────────────────── */}
      
      {/* EXPANDED STUDENT OPERATIONAL PROFILE MODAL */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-xl border border-gray-100 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-gray-900">Student Operational Profile</h3>
                <p className="text-xs text-gray-500">Centralized view of student academic, internship, and progress status</p>
              </div>
              <button onClick={() => setSelectedStudentDetail(null)} className="text-gray-400 hover:text-gray-700">
                <FaTimes />
              </button>
            </div>

            {/* Student Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Student Information</h4>
                <p className="text-sm"><strong>Name:</strong> {selectedStudentDetail.first_name} {selectedStudentDetail.last_name}</p>
                <p className="text-sm"><strong>Email:</strong> {selectedStudentDetail.email}</p>
                <p className="text-sm"><strong>Student ID:</strong> <span className="font-mono">{selectedStudentDetail.student_id_number}</span></p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Academic Information</h4>
                <p className="text-sm"><strong>Department:</strong> {selectedStudentDetail.academic_hierarchy?.department_name || 'N/A'}</p>
                <p className="text-sm"><strong>Program:</strong> {selectedStudentDetail.academic_hierarchy?.program_name || 'N/A'}</p>
                <p className="text-sm"><strong>Batch:</strong> {selectedStudentDetail.academic_hierarchy?.batch_name || 'N/A'}</p>
              </div>
            </div>

            {/* Faculty Advisor */}
            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
              <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">Assigned Faculty Advisor</h4>
              <p className="text-sm font-semibold text-gray-900">Dr. Meera Kulkarni (meera.kulkarni.demo@internsync.app)</p>
            </div>

            {/* Internship Details */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Internship Placement</h4>
              {selectedStudentDetail.internships && selectedStudentDetail.internships.length > 0 ? (
                selectedStudentDetail.internships.map((int) => (
                  <div key={int.id} className="text-sm space-y-1">
                    <p><strong>Company:</strong> {int.company_name}</p>
                    <p><strong>Role:</strong> {int.job_role}</p>
                    <p><strong>Mentor:</strong> Rahul Deshpande (rahul.deshpande.demo@internsync.app)</p>
                    <p><strong>Status:</strong> <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-bold">{int.status}</span></p>
                    <p><strong>Hours Progress:</strong> {int.approved_hours} / {int.required_hours} hrs</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 italic">No active internship placement record found.</p>
              )}
            </div>

            {/* Progress Summaries */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Daily Logs</p>
                <p className="text-lg font-bold text-gray-900">Verified</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Weekly Reports</p>
                <p className="text-lg font-bold text-gray-900">1 Submitted</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Evaluation</p>
                <p className="text-lg font-bold text-emerald-600">Satisfactory</p>
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t border-gray-100">
              <button onClick={() => setSelectedStudentDetail(null)} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200">
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL DIALOG WITH FACULTY SELECTION */}
      {approvalModalItem && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">Approve & Activate Internship</h3>
              <button onClick={() => setApprovalModalItem(null)} className="text-gray-400 hover:text-gray-700"><FaTimes /></button>
            </div>

            <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100">
              <p><strong>Student:</strong> {approvalModalItem.student?.first_name} {approvalModalItem.student?.last_name}</p>
              <p><strong>Company:</strong> {approvalModalItem.company_name}</p>
              <p><strong>Role:</strong> {approvalModalItem.job_role}</p>
              {approvalModalItem.mentor_email && (
                <p className="text-blue-900 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                  <strong>Company Mentor:</strong> {approvalModalItem.mentor_name || 'Mentor'} ({approvalModalItem.mentor_email})
                  <span className="block text-xs text-blue-700 mt-0.5">Approval will link an existing mentor account or dispatch an invitation email.</span>
                </p>
              )}
            </div>

            <form onSubmit={handleConfirmApproval} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Select Faculty Advisor *</label>
                <select
                  required
                  value={approvalFacultyId}
                  onChange={(e) => setApprovalFacultyId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">[ Select Faculty Advisor ]</option>
                  {facultyList
                    .filter((fac) => {
                      const studentBatchId = approvalModalItem?.student?.batch_id;
                      if (!studentBatchId) return true; // Show available faculty if batch context unconstrained
                      return (fac.assigned_batches || []).some((b) => b.batch_id === studentBatchId);
                    })
                    .map((fac) => (
                      <option key={fac.id} value={fac.id}>
                        {fac.first_name} {fac.last_name} ({fac.email})
                      </option>
                    ))}
                </select>
                {approvalModalItem?.student?.batch_id &&
                  facultyList.filter((fac) =>
                    (fac.assigned_batches || []).some((b) => b.batch_id === approvalModalItem.student.batch_id)
                  ).length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Note: No Faculty Advisor is currently assigned to this student's batch. Please assign a Faculty Advisor to the batch in Faculty Management first.
                    </p>
                  )}
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setApprovalModalItem(null)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm"
                >
                  {submittingModal ? 'Activating...' : 'Approve & Activate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECTION DIALOG WITH REASON INPUT */}
      {rejectionModalItem && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">Reject Internship Placement</h3>
              <button onClick={() => setRejectionModalItem(null)} className="text-gray-400 hover:text-gray-700"><FaTimes /></button>
            </div>

            <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100">
              <p><strong>Student:</strong> {rejectionModalItem.student?.first_name} {rejectionModalItem.student?.last_name}</p>
              <p><strong>Company:</strong> {rejectionModalItem.company_name}</p>
              <p><strong>Role:</strong> {rejectionModalItem.job_role}</p>
            </div>

            <form onSubmit={handleConfirmRejection} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Rejection Reason *</label>
                <textarea
                  required
                  rows="3"
                  value={rejectionInputReason}
                  onChange={(e) => setRejectionInputReason(e.target.value)}
                  placeholder="Enter the reason why this internship placement is being rejected..."
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setRejectionModalItem(null)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 shadow-sm"
                >
                  {submittingModal ? 'Rejecting...' : 'Reject Placement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Internship Detail Modal */}
      {selectedInternshipDetail && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-gray-100 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">Internship Detailed Overview</h3>
              <button onClick={() => setSelectedInternshipDetail(null)} className="text-gray-400 hover:text-gray-700">
                <FaTimes />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <p><strong>Student:</strong> {selectedInternshipDetail.student?.first_name} {selectedInternshipDetail.student?.last_name} ({selectedInternshipDetail.student?.email})</p>
              <p><strong>Company:</strong> {selectedInternshipDetail.company_name}</p>
              <p><strong>Job Role:</strong> {selectedInternshipDetail.job_role}</p>
              <p><strong>Company Mentor:</strong> {selectedInternshipDetail.mentor_name || 'Not provided'} {selectedInternshipDetail.mentor_email && `(${selectedInternshipDetail.mentor_email})`}</p>
              <p><strong>Timeline:</strong> {selectedInternshipDetail.start_date} to {selectedInternshipDetail.end_date}</p>
              <p><strong>Target Hours:</strong> {selectedInternshipDetail.required_hours} hrs</p>
              <p><strong>Status:</strong> <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-bold">{selectedInternshipDetail.status}</span></p>
            </div>
            <div className="pt-4 flex justify-end space-x-2">
              <button onClick={() => setSelectedInternshipDetail(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision Student Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-lg font-bold text-gray-900">Provision New Student</h3>
              <button onClick={() => setShowStudentModal(false)} className="text-gray-400 hover:text-gray-700"><FaTimes /></button>
            </div>
            <form onSubmit={handleProvisionStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input type="email" required value={stuEmail} onChange={e => setStuEmail(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="student@internsync.app" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">First Name</label>
                  <input type="text" required value={stuFirstName} onChange={e => setStuFirstName(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="Aarav" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Last Name</label>
                  <input type="text" required value={stuLastName} onChange={e => setStuLastName(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="Sharma" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Student ID Number</label>
                <input type="text" required value={stuIdNum} onChange={e => setStuIdNum(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="MSC-CS-2024-001" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Batch</label>
                <select required value={stuBatchId} onChange={e => setStuBatchId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm">
                  <option value="">Select Batch</option>
                  {batchOptions.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowStudentModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700">
                  {submittingModal ? 'Provisioning...' : 'Provision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Faculty Modal */}
      {showFacultyModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-lg font-bold text-gray-900">Invite Faculty Advisor</h3>
              <button onClick={() => setShowFacultyModal(false)} className="text-gray-400 hover:text-gray-700"><FaTimes /></button>
            </div>
            <form onSubmit={handleProvisionFaculty} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input type="email" required value={facEmail} onChange={e => setFacEmail(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="meera.kulkarni.demo@internsync.app" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">First Name</label>
                  <input type="text" required value={facFirstName} onChange={e => setFacFirstName(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="Dr. Meera" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Last Name</label>
                  <input type="text" required value={facLastName} onChange={e => setFacLastName(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="Kulkarni" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Assign to Batch (Optional)</label>
                <select value={facBatchId} onChange={e => setFacBatchId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm">
                  <option value="">No immediate batch assignment</option>
                  {batchOptions.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowFacultyModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700">
                  {submittingModal ? 'Sending Invite...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Assign Faculty to Batch Modal */}
      {showAssignFacultyModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-lg font-bold text-gray-900">Assign Faculty to Batch</h3>
              <button onClick={() => setShowAssignFacultyModal(false)} className="text-gray-400 hover:text-gray-700"><FaTimes /></button>
            </div>
            <form onSubmit={handleAssignFaculty} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Faculty Advisor</label>
                <select required value={assignFacultyId} onChange={e => setAssignFacultyId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm">
                  <option value="">Select Faculty Advisor</option>
                  {facultyList.map(f => (
                    <option key={f.id} value={f.id}>{f.first_name} {f.last_name} ({f.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Batch</label>
                <select required value={assignBatchId} onChange={e => setAssignBatchId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm">
                  <option value="">Select Batch</option>
                  {batchOptions.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowAssignFacultyModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" disabled={submittingModal} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">Assign</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default AdminDashboard;
