import React, { useState } from 'react';
import StudentRegistration from './forms/StudentRegistration';
import AdminRegistration from './forms/AdminRegistration';
import LoginForm from './auth/LoginForm';
import { FaClock, FaChartLine, FaSearch, FaFileExport, FaShieldAlt } from 'react-icons/fa';

function LandingPage() {
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [faqOpen, setFaqOpen] = useState(null);

  const handleGetStarted = () => {
    setShowRoleSelection(true);
  };

  const handleLoginClick = () => {
    setShowLoginForm(true);
  };

  const handleCloseLogin = () => {
    setShowLoginForm(false);
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
  };

  const handleBackToRoles = () => {
    setSelectedRole(null);
  };

  const handleLearnMore = () => {
    const el = document.getElementById('features');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const LoginModal = () => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div className="relative m-4">
        <LoginForm onClose={handleCloseLogin} />
      </div>
    </div>
  );

  const RoleSelectionModal = () => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div className="relative bg-white rounded-lg shadow-xl p-8 max-w-xl w-full m-4">
        {selectedRole === null ? (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Select Your Role</h2>
            <div className="space-y-4">
              <button 
                className="w-full p-4 text-left bg-white border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                onClick={() => handleRoleSelect('student')}
              >
                <h3 className="text-lg font-semibold text-blue-600">Student</h3>
                <p className="text-gray-600 text-sm">Track your OJT hours and submit reports</p>
              </button>
              
              
              <button 
                className="w-full p-4 text-left bg-white border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                onClick={() => handleRoleSelect('admin')}
              >
                <h3 className="text-lg font-semibold text-blue-600">Administrator</h3>
                <p className="text-gray-600 text-sm">Oversee the entire OJT program</p>
              </button>
            </div>
            <button 
              className="mt-6 w-full px-4 py-3 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition duration-150 ease-in-out"
              onClick={() => setShowRoleSelection(false)}
            >
              Close
            </button>
          </>
        ) : (
          <>
            {selectedRole === 'student' && <StudentRegistration onBack={handleBackToRoles} />}
           
            {selectedRole === 'admin' && <AdminRegistration onBack={handleBackToRoles} />}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <nav className="bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="text-2xl font-extrabold tracking-tight">
                <span className="text-gray-900">OJT</span>
                <span className="text-blue-600">Tracker</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={() => scrollToId('features')} className="text-gray-600 hover:text-gray-900">
                Features
              </button>
              <button onClick={() => scrollToId('testimonials')} className="text-gray-600 hover:text-gray-900">
                Testimonials
              </button>
              <button onClick={() => scrollToId('faq')} className="text-gray-600 hover:text-gray-900">
                FAQ
              </button>
              <button 
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150 ease-in-out"
                onClick={handleLoginClick}
              >
                Login
              </button>
            </div>
          </div>
        </div>
      </nav>

      <section className="relative isolate overflow-hidden bg-gradient-to-b from-blue-50 to-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100 via-transparent to-transparent"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
              Modern OJT Management Platform
            </div>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
              Track, Report, and Succeed in Your OJT
            </h1>
            <p className="mt-6 max-w-2xl mx-auto text-lg text-gray-600">
              Manage hours, submit logs, and monitor progress with a streamlined experience for students and administrators.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                className="px-8 py-3 rounded-md text-white bg-blue-600 hover:bg-blue-700 transition"
                onClick={handleGetStarted}
              >
                Get Started
              </button>
              <button 
                className="px-8 py-3 rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition"
                onClick={handleLearnMore}
              >
                Explore Features
              </button>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
              <div className="text-3xl font-bold text-gray-900">1k+</div>
              <div className="mt-1 text-sm text-gray-600">Students tracked</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
              <div className="text-3xl font-bold text-gray-900">150+</div>
              <div className="mt-1 text-sm text-gray-600">Agencies onboarded</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
              <div className="text-3xl font-bold text-gray-900">25k+</div>
              <div className="mt-1 text-sm text-gray-600">Daily logs submitted</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
              <div className="text-3xl font-bold text-gray-900">500k+</div>
              <div className="mt-1 text-sm text-gray-600">Hours recorded</div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-center h-16 w-16 bg-blue-100 text-blue-600 rounded-full mb-6 mx-auto">
              <FaClock className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Hour Tracking</h3>
            <p className="text-gray-600 text-center">
              Log and monitor OJT hours with real-time updates and clear summaries.
            </p>
          </div>
          <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-center h-16 w-16 bg-blue-100 text-blue-600 rounded-full mb-6 mx-auto">
              <FaChartLine className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Progress Reports</h3>
            <p className="text-gray-600 text-center">
              Submit and review progress reports with streamlined workflows and history.
            </p>
          </div>
          <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-center h-16 w-16 bg-blue-100 text-blue-600 rounded-full mb-6 mx-auto">
              <FaSearch className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Global Search</h3>
            <p className="text-gray-600 text-center">
              Find students, mentors, agencies, and logs with powerful search tools.
            </p>
          </div>
          <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-center h-16 w-16 bg-blue-100 text-blue-600 rounded-full mb-6 mx-auto">
              <FaFileExport className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Export & Analytics</h3>
            <p className="text-gray-600 text-center">
              Export filtered data and gain insights with built-in analytics views.
            </p>
          </div>
        </div>
      </section>

      <section id="testimonials" className="bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">What Users Say</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-blue-100"></div>
                <div>
                  <div className="font-semibold text-gray-900">Student</div>
                  <div className="text-sm text-gray-600">BCA, 3rd Year</div>
                </div>
              </div>
              <p className="mt-4 text-gray-700">
                The tracker made logging hours seamless and kept my reports organized.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-blue-100"></div>
                <div>
                  <div className="font-semibold text-gray-900">Agency Mentor</div>
                  <div className="text-sm text-gray-600">Tech Firm</div>
                </div>
              </div>
              <p className="mt-4 text-gray-700">
                Reviewing logs and progress was quick and clear for each intern.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-blue-100"></div>
                <div>
                  <div className="font-semibold text-gray-900">Administrator</div>
                  <div className="text-sm text-gray-600">College Coordinator</div>
                </div>
              </div>
              <p className="mt-4 text-gray-700">
                Saved views and exports helped manage batches and audits effortlessly.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="cta" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 md:p-12 text-center text-white">
          <div className="flex justify-center mb-4">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <FaShieldAlt />
            </div>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold">Ready to streamline your OJT?</h3>
          <p className="mt-2 text-blue-100">
            Start tracking and managing today with a platform built for students and administrators.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              className="px-6 py-3 rounded-md bg-white text-blue-700 hover:bg-blue-50 transition"
              onClick={handleGetStarted}
            >
              Get Started
            </button>
            <button 
              className="px-6 py-3 rounded-md bg-white/10 text-white hover:bg-white/20 transition"
              onClick={() => scrollToId('features')}
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      <section id="faq" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Frequently Asked Questions</h2>
        <div className="max-w-3xl mx-auto space-y-4">
          {[
            { q: 'How do students register?', a: 'Click Get Started and choose Student to open registration.' },
            { q: 'Can administrators manage batches?', a: 'Use the admin dashboard with filters, saved views, and exports.' },
            { q: 'Is my data secure?', a: 'We follow best practices for authentication and data handling.' }
          ].map((item, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg">
              <button
                className="w-full px-4 py-3 text-left font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
              >
                {item.q}
              </button>
              {faqOpen === idx && (
                <div className="px-4 pb-4 text-gray-700">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-gray-600">© {new Date().getFullYear()} OJT Tracker</div>
            <div className="flex items-center gap-6 text-sm">
              <button onClick={() => scrollToId('features')} className="text-gray-600 hover:text-gray-900">Features</button>
              <button onClick={() => scrollToId('faq')} className="text-gray-600 hover:text-gray-900">FAQ</button>
              <button onClick={handleLoginClick} className="text-gray-600 hover:text-gray-900">Login</button>
            </div>
          </div>
        </div>
      </footer>

      {showRoleSelection && <RoleSelectionModal />}
      {showLoginForm && <LoginModal />}
    </div>
  );
}

export default LandingPage; 
