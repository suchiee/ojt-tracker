import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthV2 } from '../../context/AuthContext';
import {
  FaHome,
  FaSignOutAlt,
  FaClipboardList,
  FaFileAlt,
  FaStar,
  FaBars,
  FaChevronLeft,
  FaChevronRight,
  FaBell,
  FaUserGraduate,
  FaChalkboardTeacher,
  FaBuilding,
  FaEnvelope,
  FaCog,
  FaCheckCircle,
  FaHourglassHalf,
  FaSitemap
} from 'react-icons/fa';

function DashboardLayout({ children, userRole, activeTab, onTabChange }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { profile, signOut, roles, assignments, activeTenant, loading } = useAuthV2();

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

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User';
  const tenantName = activeTenant?.name || 'Nowrosjee Wadia College';

  // Navigation Items for Admin Role
  const adminNavSections = [
    {
      title: 'Main',
      items: [
        { id: 'overview', label: 'Dashboard', icon: FaHome }
      ]
    },
    {
      title: 'Academic',
      items: [
        { id: 'departments', label: 'Departments', icon: FaSitemap },
        { id: 'programs', label: 'Programs', icon: FaBuilding },
        { id: 'batches', label: 'Batches', icon: FaClipboardList }
      ]
    },
    {
      title: 'People',
      items: [
        { id: 'students', label: 'Students', icon: FaUserGraduate },
        { id: 'faculty', label: 'Faculty', icon: FaChalkboardTeacher }
      ]
    },
    {
      title: 'Internships',
      items: [
        { id: 'pending-requests', label: 'Pending Requests', icon: FaHourglassHalf },
        { id: 'active-internships', label: 'Active Internships', icon: FaClipboardList },
        { id: 'completed-internships', label: 'Completed Internships', icon: FaCheckCircle }
      ]
    },
    {
      title: 'Communication',
      items: [
        { id: 'mentor-invitations', label: 'Mentor Invitations', icon: FaEnvelope },
        { id: 'settings', label: 'Settings', icon: FaCog }
      ]
    }
  ];

  const studentMenuItems = [
    { path: '/dashboard', icon: FaHome, label: 'Overview' },
    { path: '/dashboard/daily-logs', icon: FaClipboardList, label: 'Daily Logs' },
    { path: '/dashboard/weekly-reports', icon: FaFileAlt, label: 'Weekly Reports' },
    { path: '/dashboard/evaluation', icon: FaStar, label: 'Agency Evaluation' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm h-16 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center space-x-3">
          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-gray-600 hover:text-gray-900 focus:outline-none p-2 rounded-md hover:bg-gray-100"
          >
            <FaBars className="h-5 w-5" />
          </button>

          {/* Logo & Institution Name */}
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
              IS
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 tracking-tight leading-none">
                InternSync
              </h1>
              <p className="text-xs text-blue-600 font-medium leading-tight mt-0.5">
                {tenantName}
              </p>
            </div>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center space-x-4">
          {/* Notifications Icon */}
          <button className="relative text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition focus:outline-none">
            <FaBell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white"></span>
          </button>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 focus:outline-none p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-semibold flex items-center justify-center text-sm shadow-sm">
                {userName ? userName.charAt(0).toUpperCase() : 'A'}
              </div>
              <span className="hidden sm:inline text-sm font-medium text-gray-700">
                {userName}
              </span>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg py-2 border border-gray-100 z-50 animate-in fade-in duration-150">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{profile?.email}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full">
                    {resolvedRole.replace('_', ' ')}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium transition"
                >
                  <FaSignOutAlt className="mr-3 h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside
          className={`hidden md:flex flex-col bg-white border-r border-gray-200 transition-all duration-300 relative z-20 ${
            collapsed ? 'w-20' : 'w-64'
          }`}
        >
          {/* Collapse Toggle Button */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-6 bg-white border border-gray-200 text-gray-500 hover:text-gray-800 p-1 rounded-full shadow-sm focus:outline-none z-30"
          >
            {collapsed ? <FaChevronRight className="h-3 w-3" /> : <FaChevronLeft className="h-3 w-3" />}
          </button>

          <nav className="flex-1 overflow-y-auto p-4 space-y-6">
            {resolvedRole === 'ADMIN' ? (
              adminNavSections.map((sec, idx) => (
                <div key={idx}>
                  {!collapsed && (
                    <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      {sec.title}
                    </h3>
                  )}
                  <div className="space-y-1">
                    {sec.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => onTabChange && onTabChange(item.id)}
                          title={collapsed ? item.label : undefined}
                          className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${collapsed ? 'mx-auto' : 'mr-3'}`} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-1">
                {studentMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="mr-3 h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>
        </aside>

        {/* Mobile Drawer Backdrop & Sidebar */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div
              className="fixed inset-0 bg-gray-600 bg-opacity-50 transition-opacity"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative flex-1 flex flex-col max-w-xs w-full bg-white border-r border-gray-200 z-50">
              <div className="p-4 border-b flex justify-between items-center">
                <span className="font-bold text-gray-900">Navigation</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
                >
                  <FaChevronLeft className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4 space-y-6">
                {resolvedRole === 'ADMIN' &&
                  adminNavSections.map((sec, idx) => (
                    <div key={idx}>
                      <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        {sec.title}
                      </h3>
                      <div className="space-y-1">
                        {sec.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeTab === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                onTabChange && onTabChange(item.id);
                                setMobileOpen(false);
                              }}
                              className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              <Icon className="mr-3 h-4 w-4" />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content View */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;