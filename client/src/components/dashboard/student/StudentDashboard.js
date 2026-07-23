import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../DashboardLayout';
import TrainingSetup from './TrainingSetup';
import { FaCalendarAlt, FaBuilding, FaBriefcase, FaClock, FaUser, FaChartLine, FaClipboardCheck } from 'react-icons/fa';
import {
  getTrainingDetails,
  updateTrainingDetails,
  getDailyLogs as getLegacyDailyLogs
} from '../../../services/trainingService';
import {
  getInternships,
  getInternshipById
} from '../../../services/internshipV2Service';
import {
  getDailyLogs
} from '../../../services/dailyLogV2Service';

function StudentDashboard() {
  const [trainingDetails, setTrainingDetails] = useState(null);
  const [isV2, setIsV2] = useState(false);
  const [dailyLogsCount, setDailyLogsCount] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      // 1. Try to load V2 active internship from hosted Supabase
      try {
        const internshipsRes = await getInternships();
        const active = (internshipsRes?.data || []).find(i => i.status === 'ACTIVE');
        if (active) {
          const detailsRes = await getInternshipById(active.id);
          if (detailsRes?.data) {
            const data = detailsRes.data;
            setTrainingDetails({
              id: data.id,
              agencyName: data.companies?.name || 'Not specified',
              mentor: 'Assigned by Coordinator',
              jobRole: data.job_role,
              startDate: data.start_date,
              endDate: data.end_date,
              totalHours: data.total_hours,
              completedHours: data.hours_summary?.approved_hours || 0,
              loggedHours: data.hours_summary?.logged_hours || 0,
              status: data.status
            });
            setIsV2(true);

            // Get total count of V2 daily logs via pagination total
            const logsRes = await getDailyLogs(data.id, { limit: 1 });
            setDailyLogsCount(logsRes.pagination?.total || 0);
            setLoading(false);
            return;
          }
        }
      } catch (v2Err) {
        console.warn('V2 Dashboard Load failed, falling back to legacy MongoDB:', v2Err.message);
      }

      // 2. Fallback to MongoDB Legacy if no active V2 internship is assigned
      const details = await getTrainingDetails();
      if (details && details._id) {
        setTrainingDetails({
          id: details._id,
          agencyName: details.agencyName,
          mentor: details.mentor,
          jobRole: details.jobRole,
          startDate: details.startDate,
          endDate: details.endDate,
          totalHours: details.totalHours,
          completedHours: details.completedHours,
          loggedHours: details.completedHours,
          status: details.status
        });
        setIsV2(false);
        
        // Load legacy daily logs
        const legacyLogs = await getLegacyDailyLogs();
        setDailyLogsCount(legacyLogs.length);
      } else {
        console.log('No training details found - showing setup form');
        setTrainingDetails(null);
      }
    } catch (err) {
      console.log('Dashboard - Error:', err);
      setError(err.message || 'Error loading dashboard data');
      setTrainingDetails(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on component mount
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Calculate progress
  const progressPercentage = trainingDetails
    ? Math.round((trainingDetails.completedHours / trainingDetails.totalHours) * 100)
    : 0;
    
  // Calculate milestones
  const milestones = trainingDetails ? [
    { name: '25% Complete', target: trainingDetails.totalHours * 0.25, completed: trainingDetails.completedHours >= trainingDetails.totalHours * 0.25 },
    { name: '50% Complete', target: trainingDetails.totalHours * 0.5, completed: trainingDetails.completedHours >= trainingDetails.totalHours * 0.5 },
    { name: '75% Complete', target: trainingDetails.totalHours * 0.75, completed: trainingDetails.completedHours >= trainingDetails.totalHours * 0.75 },
    { name: '100% Complete', target: trainingDetails.totalHours, completed: trainingDetails.completedHours >= trainingDetails.totalHours }
  ] : [];

  const handleTrainingSetup = async (details) => {
    try {
      console.log('Dashboard - Submitting details:', details);
      const savedDetails = await updateTrainingDetails(details);
      console.log('Dashboard - Saved details:', savedDetails);
      
      if (savedDetails && savedDetails._id) {
        if (!savedDetails.mentor && details.mentor) {
          savedDetails.mentor = details.mentor;
        }
        setTrainingDetails({
          id: savedDetails._id,
          agencyName: savedDetails.agencyName,
          mentor: savedDetails.mentor,
          jobRole: savedDetails.jobRole,
          startDate: savedDetails.startDate,
          endDate: savedDetails.endDate,
          totalHours: savedDetails.totalHours,
          completedHours: savedDetails.completedHours,
          loggedHours: savedDetails.completedHours,
          status: savedDetails.status
        });
        setIsV2(false);
      } else {
        console.log('No valid saved details received');
        setError('Invalid training details received');
      }
      
      await loadDashboardData();
    } catch (err) {
      console.log('Dashboard - Setup error:', err);
      setError(err.message || 'Error saving training details');
    }
  };

  if (loading) {
    return (
      <DashboardLayout userRole="student">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="student">
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {!trainingDetails ? (
        <TrainingSetup onSubmit={handleTrainingSetup} />
      ) : (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">Student Dashboard</div>
                <div className="text-sm opacity-90 mt-1">
                  Training overview & progress {isV2 ? '(Supabase V2)' : '(MongoDB Legacy)'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm">Agency</div>
                <div className="font-semibold">{trainingDetails.agencyName || 'Not specified'}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-600">Approved Hours</div>
              <div className="text-2xl font-semibold text-blue-600">{trainingDetails.completedHours}</div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-600">Logged Hours</div>
              <div className="text-2xl font-semibold text-gray-800">{trainingDetails.loggedHours}</div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-600">Progress</div>
              <div className="text-2xl font-semibold text-green-600">{progressPercentage}%</div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-600">Daily Logs</div>
              <div className="text-2xl font-semibold text-indigo-600">{dailyLogsCount}</div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex flex-wrap space-x-2 md:space-x-4">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  activeTab === 'overview'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Overview
              </button>
            </div>
          </div>

          {activeTab === 'overview' && (
            <>
              {/* Progress Overview Card */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">OJT Progress Overview</h2>
                <div className="flex flex-col md:flex-row md:items-center mb-6">
                  <div className="flex-1 mb-4 md:mb-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">Progress</span>
                      <span className="text-sm font-medium text-gray-700">{progressPercentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div 
                        className={`h-4 rounded-full transition-all duration-500 ease-in-out ${
                          progressPercentage < 25 ? 'bg-red-500' : 
                          progressPercentage < 50 ? 'bg-yellow-500' : 
                          progressPercentage < 75 ? 'bg-blue-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      {trainingDetails.completedHours} of {trainingDetails.totalHours} hours approved
                    </div>
                  </div>
                  <div className="md:ml-8 flex flex-col items-center">
                    <div className="text-3xl font-bold text-blue-600">{trainingDetails.completedHours}</div>
                    <div className="text-sm text-gray-600">Hours Approved</div>
                  </div>
                </div>
                
                {/* Training Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <FaBuilding className="text-blue-600 mr-3" />
                      <div>
                        <div className="text-sm text-gray-600">Training Agency</div>
                        <div className="font-medium">{trainingDetails.agencyName || 'Not specified'}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <FaUser className="text-blue-600 mr-3" />
                      <div>
                        <div className="text-sm text-gray-600">Mentor</div>
                        <div className="font-medium">{trainingDetails.mentor || 'Not specified'}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <FaBriefcase className="text-blue-600 mr-3" />
                      <div>
                        <div className="text-sm text-gray-600">Job Role</div>
                        <div className="font-medium">{trainingDetails.jobRole}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <FaCalendarAlt className="text-blue-600 mr-3" />
                      <div>
                        <div className="text-sm text-gray-600">Training Period</div>
                        <div className="font-medium">
                          {new Date(trainingDetails.startDate).toLocaleDateString()} - {new Date(trainingDetails.endDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <FaClock className="text-blue-600 mr-3" />
                      <div>
                        <div className="text-sm text-gray-600">Total Hours Required</div>
                        <div className="font-medium">{trainingDetails.totalHours} hours</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <FaChartLine className="text-blue-600 mr-3" />
                      <div>
                        <div className="text-sm text-gray-600">Daily Average</div>
                        <div className="font-medium">
                          {dailyLogsCount > 0 
                            ? (trainingDetails.completedHours / dailyLogsCount).toFixed(1) 
                            : 0} hours/day
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Milestones */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Milestones</h3>
                  <div className="space-y-3">
                    {milestones.map((milestone, index) => (
                      <div key={index} className="flex items-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${
                          milestone.completed ? 'bg-green-500 text-white' : 'bg-gray-200'
                        }`}>
                          {milestone.completed && <FaClipboardCheck className="w-3 h-3" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <span className={`font-medium ${milestone.completed ? 'text-green-600' : 'text-gray-600'}`}>
                              {milestone.name}
                            </span>
                            <span className="text-sm text-gray-500">
                              {milestone.target} hours
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div 
                              className={`h-2 rounded-full ${milestone.completed ? 'bg-green-500' : 'bg-blue-400'}`}
                              style={{ width: `${Math.min(100, (trainingDetails.completedHours / milestone.target) * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

export default StudentDashboard;
