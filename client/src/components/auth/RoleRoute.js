import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthV2 } from '../../context/AuthContext';

export const RoleRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, activeMembership, roles } = useAuthV2();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If student is authenticated but has no memberships at all, redirect to student onboarding
  if (roles.length === 0 && !activeMembership) {
    return <Navigate to="/onboard" replace />;
  }

  // Check role permission context
  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return children;
};
