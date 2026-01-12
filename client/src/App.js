import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import StudentDashboard from './components/dashboard/student/StudentDashboard';
import Evaluation from './components/dashboard/student/Evaluation';
import DailyLogs from './components/dashboard/student/DailyLogs';
import StudentRegistration from './components/forms/StudentRegistration';
import AdminRegistration from './components/forms/AdminRegistration';
import { isAuthenticated } from './services/authService';
import AdminDashboard from './components/dashboard/admin/AdminDashboard';

function App() {
  // Protected route component
  const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated()) {
      return <Navigate to="/" replace />;
    }
    return children;
  };

  // Role-based route component
  const RoleRoute = ({ children, allowedRoles }) => {
    // Get user from localStorage instead of calling the async function
    const userStr = localStorage.getItem('user');
    let user = null;
    
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    
    if (!isAuthenticated() || !user || !allowedRoles.includes(user.role)) {
      return <Navigate to="/" replace />;
    }
    return children;
  };

  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<StudentRegistration />} />
        <Route path="/register/admin" element={<AdminRegistration />} />
        
        {/* Protected routes */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <StudentDashboard />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/dashboard/daily-logs" 
          element={
            <RoleRoute allowedRoles={['student']}>
              <DailyLogs />
            </RoleRoute>
          } 
        />
        
        <Route 
          path="/dashboard/evaluation" 
          element={
            <RoleRoute allowedRoles={['student']}>
              <Evaluation />
            </RoleRoute>
          } 
        />
        
        <Route 
          path="/admin/dashboard" 
          element={
            <RoleRoute allowedRoles={['admin']}>
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
