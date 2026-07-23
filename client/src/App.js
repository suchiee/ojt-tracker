import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import StudentDashboard from './components/dashboard/student/StudentDashboard';
import Evaluation from './components/dashboard/student/Evaluation';
import DailyLogs from './components/dashboard/student/DailyLogs';
import WeeklyReports from './components/dashboard/student/WeeklyReports';
import StudentRegistration from './components/forms/StudentRegistration';
import AdminRegistration from './components/forms/AdminRegistration';
import StudentOnboarding from './components/forms/StudentOnboarding';
import Unauthorized from './components/auth/Unauthorized';
import AdminDashboard from './components/dashboard/admin/AdminDashboard';
import MentorDashboard from './components/dashboard/mentor/MentorDashboard';
import FacultyDashboard from './components/dashboard/faculty/FacultyDashboard';
import { useAuthV2 } from './context/AuthContext';

// Protected route component using V2 context
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuthV2();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// Role-based route component using V2 context
const RoleRoute = ({ children, allowedRoles, requireMentorAssignments = false, requireStudentOnly = false }) => {
  const { isAuthenticated, loading, roles, assignments, activeMembership } = useAuthV2();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // If student is authenticated but has no memberships at all, redirect to student onboarding
  if (roles.length === 0 && !activeMembership) {
    return <Navigate to="/onboard" replace />;
  }

  // Check role permission context against database roles (uppercase)
  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  const isCompanyMentor = Array.isArray(assignments) && assignments.some(a => a.mentor_type === 'COMPANY');

  // Disambiguate Company Mentor vs Genuine Student routing
  if (requireMentorAssignments && !isCompanyMentor) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireStudentOnly && isCompanyMentor) {
    return <Navigate to="/mentor/dashboard" replace />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<StudentRegistration />} />
        <Route path="/register/admin" element={<AdminRegistration />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        
        {/* Onboarding route (Must be logged in to access) */}
        <Route 
          path="/onboard" 
          element={
            <ProtectedRoute>
              <StudentOnboarding />
            </ProtectedRoute>
          } 
        />

        {/* Protected V2 Student routes */}
        <Route 
          path="/dashboard" 
          element={
            <RoleRoute allowedRoles={['STUDENT']} requireStudentOnly={true}>
              <StudentDashboard />
            </RoleRoute>
          } 
        />
        
        <Route 
          path="/dashboard/daily-logs" 
          element={
            <RoleRoute allowedRoles={['STUDENT']} requireStudentOnly={true}>
              <DailyLogs />
            </RoleRoute>
          } 
        />

        <Route 
          path="/dashboard/weekly-reports" 
          element={
            <RoleRoute allowedRoles={['STUDENT']} requireStudentOnly={true}>
              <WeeklyReports />
            </RoleRoute>
          } 
        />
        
        <Route 
          path="/dashboard/evaluation" 
          element={
            <RoleRoute allowedRoles={['STUDENT']} requireStudentOnly={true}>
              <Evaluation />
            </RoleRoute>
          } 
        />

        {/* Protected V2 Mentor route */}
        <Route 
          path="/mentor/dashboard" 
          element={
            <RoleRoute allowedRoles={['STUDENT']} requireMentorAssignments={true}>
              <MentorDashboard />
            </RoleRoute>
          } 
        />


        {/* Protected V2 Faculty route */}
        <Route 
          path="/faculty/dashboard" 
          element={
            <RoleRoute allowedRoles={['FACULTY_MENTOR']}>
              <FacultyDashboard />
            </RoleRoute>
          } 
        />
        
        {/* Protected V2 Admin route */}
        <Route 
          path="/admin/dashboard" 
          element={
            <RoleRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </RoleRoute>
          } 
        />
        
        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
