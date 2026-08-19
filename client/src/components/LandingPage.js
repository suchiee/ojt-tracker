import React, { useState } from 'react';
import LoginForm from './auth/LoginForm';
import { FaClock, FaChartLine, FaUserCheck, FaShieldAlt } from 'react-icons/fa';

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
                <p className="text-gray-600 text-sm">Track your internship hours and submit reports</p>
              </button>
              
              <button 
                className="w-full p-4 text-left bg-white border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                onClick={() => handleRoleSelect('admin')}
              >
                <h3 className="text-lg font-semibold text-blue-600">Administrator</h3>
                <p className="text-gray-600 text-sm">Oversee the entire internship program</p>
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
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Invitation-Only Access</h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              Access to InternSync is managed exclusively through institutional invitations.
              If you have received an invitation, please use the link sent to your email to activate your account.
              Contact your administrator if you have not received an invite.
            </p>
            <button
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150 ease-in-out font-medium"
              onClick={handleBackToRoles}
            >
              Back
            </button>
          </div>
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
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shadow-sm">
                  IS
                </div>
                <span className="text-xl font-extrabold tracking-tight text-gray-900">InternSync</span>
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
              Internship Management Platform
            </div>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
              Track, Review, and Complete Internships
            </h1>
            <p className="mt-6 max-w-2xl mx-auto text-lg text-gray-600">
              Manage hours, submit logs, and monitor progress with a streamlined experience for students, mentors, and administrators.
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
              <div className="mt-1 text-sm text-gray-600">Companies onboarded</div>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Daily Log Tracking</h3>
            <p className="text-gray-600 text-center">
              Log and monitor internship hours with real-time updates and clear daily summaries.
            </p>
          </div>
          <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-center h-16 w-16 bg-blue-100 text-blue-600 rounded-full mb-6 mx-auto">
              <FaChartLine className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Weekly Progress Reports</h3>
            <p className="text-gray-600 text-center">
              Submit and review weekly reports with mentor approval workflows and version history.
            </p>
          </div>
          <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-center h-16 w-16 bg-blue-100 text-blue-600 rounded-full mb-6 mx-auto">
              <FaUserCheck className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Mentor Review Workflows</h3>
            <p className="text-gray-600 text-center">
              Company mentors and faculty mentors each have dedicated review queues and approval flows.
            </p>
          </div>
          <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-center h-16 w-16 bg-blue-100 text-blue-600 rounded-full mb-6 mx-auto">
              <FaShieldAlt className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Role-Based Access</h3>
            <p className="text-gray-600 text-center">
              Secure, invitation-based onboarding for students, faculty mentors, company mentors, and admins.
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
                  <div className="text-sm text-gray-600">M.Sc. Computer Science</div>
                </div>
              </div>
              <p className="mt-4 text-gray-700">
                InternSync made logging hours seamless and kept my reports organized throughout the internship.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-blue-100"></div>
                <div>
                  <div className="font-semibold text-gray-900">Company Mentor</div>
                  <div className="text-sm text-gray-600">Tech Firm</div>
                </div>
              </div>
              <p className="mt-4 text-gray-700">
                Reviewing logs and progress was quick and clear for each intern assigned to me.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-blue-100"></div>
                <div>
                  <div className="font-semibold text-gray-900">Administrator</div>
                  <div className="text-sm text-gray-600">College</div>
                </div>
              </div>
              <p className="mt-4 text-gray-700">
                Managing batches, approvals, and faculty assignments is effortless with the admin dashboard.
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
          <h3 className="text-2xl md:text-3xl font-bold">Ready to manage your internship?</h3>
          <p className="mt-2 text-blue-100">
            Start tracking and managing today with a platform built for students, mentors, and administrators.
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
            {
              q: 'How do I get access?',
              a: 'Accounts are invitation-only. Students, faculty mentors, and company mentors receive access through their institution\'s onboarding process. Contact your administrator if you have not received an invitation.'
            },
            { q: 'Can administrators manage batches?', a: 'Yes. The admin dashboard provides full control over departments, programs, batches, student enrollment, faculty assignments, and internship approvals.' },
            { q: 'Is my data secure?', a: 'Yes. InternSync uses Supabase authentication with row-level security, ensuring each user only accesses their own data.' }
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
            <div className="flex items-center space-x-2">
              <div className="h-6 w-6 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                IS
              </div>
              <span className="text-gray-600">© {new Date().getFullYear()} InternSync</span>
            </div>
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
