import React, { useState } from 'react';
import { useAuthV2 } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function LoginForm({ onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signIn, refreshContext } = useAuthV2();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
  
    try {
      const cleanEmail = email.trim().toLowerCase();
      console.log('[LOGIN STEP 1] Attempting Supabase signInWithPassword for:', cleanEmail);
      
      // Sign in using Supabase Client Auth
      const authResult = await signIn(cleanEmail, password);
      console.log('[LOGIN STEP 2] Supabase signInWithPassword SUCCESS. User ID:', authResult?.user?.id);
      
      // Load user profile details and roles context from backend
      console.log('[LOGIN STEP 3] Fetching user profile and roles via refreshContext()...');
      const data = await refreshContext();
      console.log('[LOGIN STEP 4] refreshContext data received:', data);

      const roles = data.roles || [];
      const memberships = data.memberships || [];
      const assignments = data.assignments || [];

      // Determine correct V2 dashboard redirection based on roles and assignments
      if (roles.length === 0 && memberships.length === 0) {
        console.log('[LOGIN ROUTING] No roles or memberships -> /onboard');
        navigate('/onboard');
      } else if (roles.includes('ADMIN')) {
        console.log('[LOGIN ROUTING] ADMIN role detected -> /admin/dashboard');
        navigate('/admin/dashboard');
      } else if (roles.includes('FACULTY_MENTOR')) {
        console.log('[LOGIN ROUTING] FACULTY_MENTOR role detected -> /faculty/dashboard');
        navigate('/faculty/dashboard');
      } else if (roles.includes('STUDENT')) {
        // If they have explicit company mentor assignments, route to mentor dashboard
        if (assignments.length > 0) {
          console.log('[LOGIN ROUTING] COMPANY MENTOR detected -> /mentor/dashboard');
          navigate('/mentor/dashboard');
        } else {
          console.log('[LOGIN ROUTING] STUDENT detected -> /dashboard');
          navigate('/dashboard');
        }
      } else {
        throw new Error('No authorized batch roles found for this account.');
      }
      
      if (onClose) onClose();
    } catch (err) {
      console.error('[LOGIN ERROR CATCH]:', err);
      setError(err.message || 'Invalid credentials. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-xl max-w-xl w-full">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Login</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}
      
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            className="block w-full px-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 transition duration-150 ease-in-out"
            required
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            className="block w-full px-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 transition duration-150 ease-in-out"
            required
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="flex space-x-4 mt-8">
          <button
            type="button"
            onClick={onClose}
            className="w-1/2 py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="w-1/2 py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LoginForm;
