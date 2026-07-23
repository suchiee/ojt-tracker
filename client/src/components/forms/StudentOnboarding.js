import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthV2 } from '../../context/AuthContext';
import apiV2 from '../../services/apiV2';

function StudentOnboarding() {
  const navigate = useNavigate();
  const { refreshContext, signOut } = useAuthV2();
  const [invitationCode, setInvitationCode] = useState('');
  const [studentIdNumber, setStudentIdNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Onboarding student with code and ID...');
      const response = await apiV2.post('/auth/student/onboard', {
        invitationCode,
        studentIdNumber
      });

      console.log('Onboarding response:', response.data);
      setSuccess(true);
      
      // Reload user profile/memberships context from the server
      await refreshContext();

      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      console.error('Onboarding error:', err);
      setError(err.response?.data?.message || 'Onboarding failed. Please verify your invitation code and student ID.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (err) {
      console.error('Logout error during cancel:', err);
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Student Onboarding
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter your invitation code to link your account to your college batch
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}

          {success ? (
            <div className="p-3 bg-green-100 text-green-700 rounded-md text-sm text-center">
              Onboarding successful! Redirecting to your dashboard...
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invitation Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter the code provided by your coordinator"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Student ID Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. STU-2026-001"
                  value={studentIdNumber}
                  onChange={(e) => setStudentIdNumber(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                  disabled={loading}
                />
              </div>

              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-1/2 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  disabled={loading}
                >
                  Cancel & Sign Out
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Complete Onboarding'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentOnboarding;
