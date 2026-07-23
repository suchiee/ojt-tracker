import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthV2 } from '../../context/AuthContext';
import {
  FaHome,
  FaUser,
  FaSignOutAlt,
  FaCog,
  FaBuilding,
  FaClipboardList,
  FaFileAlt,
  FaStar
} from 'react-icons/fa';

function DashboardLayout({ children, userRole }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { profile, signOut, roles, assignments, activeMembership, loading } = useAuthV2();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error logging out:', error);
      navigate('/');
    }
  };

  // Determine active menu item roles dynamically
  let resolvedRole = userRole?.toUpperCase() || 'STUDENT';
  if (roles.includes('ADMIN')) {
    resolvedRole = 'ADMIN';
  } else if (roles.includes('FACULTY_MENTOR')) {
    resolvedRole = 'FACULTY_MENTOR';
  } else if (roles.includes('STUDENT')) {
    const hasCompanyMentorAssignment = Array.isArray(assignments) && assignments.some(a => a.mentor_type === 'COMPANY');
    if (hasCompanyMentorAssignment || location.pathname.startsWith('/mentor') || userRole === 'coordinator' || userRole === 'mentor') {
      resolvedRole = 'MENTOR';
    } else {
      resolvedRole = 'STUDENT';
    }
  }


  const menuItems = {
    STUDENT: [
      { path: '/dashboard', icon: FaHome, label: 'Overview' },
      { path: '/dashboard/daily-logs', icon: FaClipboardList, label: 'Daily Logs' },
      { path: '/dashboard/weekly-reports', icon: FaFileAlt, label: 'Weekly Reports' },
      { path: '/dashboard/evaluation', icon: FaStar, label: 'Agency Evaluation' }
    ],
    MENTOR: [
      { path: '/mentor/dashboard', icon: FaHome, label: 'Review Queue' }
    ],
    FACULTY_MENTOR: [
      { path: '/faculty/dashboard', icon: FaHome, label: 'Review Queue' }
    ],
    ADMIN: [
      { path: '/admin/dashboard', icon: FaHome, label: 'Overview' }
    ]
  };

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg z-20">
        <div className="flex flex-col h-full">
          {/* Logo and Welcome Message */}
          <div className="p-4 border-b">
            <h1 className="text-xl font-bold text-blue-600 font-sans tracking-wide">OJT Tracker</h1>
            {profile && (
              <p className="mt-2 text-sm text-gray-600 font-medium">
                Hello, {profile.first_name}
              </p>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {menuItems[resolvedRole]?.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="mr-3" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t">
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center w-full focus:outline-none"
              >
                <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                  {userName ? userName.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="ml-2 text-gray-700 font-medium text-sm text-left truncate w-40">{userName}</span>
              </button>

              {/* User Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-lg shadow-lg py-1 border border-gray-100">
                  <div className="px-4 py-2 border-b">
                    <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
                    <p className="text-xs text-gray-500 capitalize">{resolvedRole.replace('_', ' ').toLowerCase()}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <FaSignOutAlt className="mr-3" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {children}
      </div>
    </div>
  );
}

export default DashboardLayout;