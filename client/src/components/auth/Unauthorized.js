import React from 'react';
import { Link } from 'react-router-dom';

function Unauthorized() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
          <h2 className="text-3xl font-extrabold text-red-600 mb-4">Unauthorized Access</h2>
          <p className="text-gray-600 mb-6">
            You do not have the required permissions to access this page. Please contact your coordinator if you believe this is an error.
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Unauthorized;
