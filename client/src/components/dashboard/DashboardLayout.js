import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FaHome,
  FaUser,
  FaSignOutAlt,
  FaCog,
  FaBuilding,
  FaClipboardList,
  FaStar
} from 'react-icons/fa';

function DashboardLayout({ children, userRole }) {
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = () => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        setUserName(userData.name || userData.email.split('@')[0]);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const menuItems = {
    student: [
      { path: '/dashboard', icon: FaHome, label: 'Overview' },
      { path: '/dashboard/daily-logs', icon: FaClipboardList, label: 'Daily Logs' },
      { path: '/dashboard/evaluation', icon: FaStar, label: 'Agency Evaluation' }
    ],
    coordinator: [
      { path: '/dashboard', icon: FaHome, label: 'Overview' },
      { path: '/dashboard/students', icon: FaUser, label: 'Students' },
      { path: '/dashboard/training-agencies', icon: FaBuilding, label: 'Training Agencies' },
      { path: '/dashboard/settings', icon: FaCog, label: 'Settings' }
    ]
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg">
        <div className="flex flex-col h-full">
          {/* Logo and Welcome Message */}
          <div className="p-4 border-b">
            <h1 className="text-xl font-bold text-blue-600">OJT Tracker</h1>
            {!loading && userName && (
              <p className="mt-2 text-sm text-gray-600">
                Hello, {userName}
              </p>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {menuItems[userRole]?.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
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
                <span className="ml-2 text-gray-700">{userName || 'User'}</span>
              </button>

              {/* User Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-lg shadow-lg py-1">
                  <div className="px-4 py-2 border-b">
                    <p className="text-sm font-medium text-gray-900">{userName}</p>
                    <p className="text-xs text-gray-500 capitalize">{userRole}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-4 py-2 text-gray-700 hover:bg-gray-50"
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