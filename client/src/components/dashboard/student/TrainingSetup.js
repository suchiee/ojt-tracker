import React, { useState } from 'react';
import { FaBuilding, FaCalendarAlt, FaBriefcase, FaUser, FaClock } from 'react-icons/fa';

function TrainingSetup({ onSubmit }) {
  const [agency, setAgency] = useState('');
  const [mentor, setMentor] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalHours, setTotalHours] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!agency || !mentor || !jobRole || !startDate || !endDate || !totalHours) {
      setError('Please fill in all fields');
      return;
    }

    if (new Date(startDate) >= new Date(endDate)) {
      setError('End date must be after start date');
      return;
    }

    if (parseInt(totalHours) <= 0) {
      setError('Total hours must be greater than 0');
      return;
    }

    // Log the data being submitted
    const data = {
      agencyName: agency,
      mentor,
      jobRole,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalHours: parseInt(totalHours),
      completedHours: 0,
      agencyFeedback: []
    };
    
    console.log('TrainingSetup - Submitting data:', data);
    onSubmit(data);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Training Setup</h2>
      <p className="text-gray-600 mb-6">Please complete your OJT training details to get started</p>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Training Agency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Training Agency
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaBuilding className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your training agency name"
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Mentor Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mentor Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaUser className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your mentor's name"
              value={mentor}
              onChange={(e) => setMentor(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Job Role */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Job Role
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaBriefcase className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your job role (e.g., Software Developer, Data Analyst)"
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Training Period */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaCalendarAlt className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaCalendarAlt className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                required
              />
            </div>
          </div>
        </div>

        {/* Total Hours */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Training Hours Required
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaClock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="number"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter total hours required"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
              min="1"
              required
            />
          </div>
          <p className="mt-1 text-sm text-gray-500">This will be used to calculate your OJT progress</p>
        </div>

        <button
          type="submit"
          className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Save Training Details
        </button>
      </form>
    </div>
  );
}

export default TrainingSetup;