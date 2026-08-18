import React, { useState, useEffect } from 'react';
import { FaStar, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import DashboardLayout from '../DashboardLayout';
import { getInternships } from '../../../services/internshipV2Service';
import { getEvaluation, submitEvaluation } from '../../../services/evaluationService';

function Evaluation() {
  const [internshipId, setInternshipId] = useState(null);
  const [internshipStatus, setInternshipStatus] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    agencyName: '',
    supervisorName: '',
    trainingPeriod: '',
    ratings: {
      workEnvironment: 0,
      supervision: 0,
      learningOpportunities: 0,
      skillDevelopment: 0,
      communication: 0,
      overallExperience: 0
    },
    strengths: '',
    improvements: '',
    additionalComments: ''
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await getInternships();
        const list = res?.data || [];
        const active = list.find(i => i.status === 'ACTIVE') || 
                       list.find(i => i.status === 'PENDING_VERIFICATION') || 
                       list.find(i => i.status === 'REJECTED') ||
                       list[list.length - 1];
        if (active) {
          setInternshipId(active.id);
          setInternshipStatus(active.status);
          setRejectionReason(active.rejection_reason || null);

          // If active is approved/active, check if evaluation already exists
          if (active.status === 'ACTIVE') {
            try {
              const evalData = await getEvaluation(active.id);
              if (evalData && evalData.data) {
                setFormData(evalData.data);
                setSubmitted(true);
              }
            } catch (evalErr) {
              // 404 is expected if not submitted yet
              console.log('No existing evaluation found:', evalErr.message || evalErr);
            }
          }
        }
      } catch (err) {
        console.warn('Evaluation.js resolve active internship failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleRatingChange = (category, rating) => {
    setFormData({
      ...formData,
      ratings: {
        ...formData.ratings,
        [category]: rating
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Form validation checks
    if (!formData.agencyName.trim() || !formData.supervisorName.trim() || !formData.trainingPeriod.trim()) {
      setError('Please fill in all agency information fields.');
      return;
    }

    const { ratings } = formData;
    const ratingKeys = ['workEnvironment', 'supervision', 'learningOpportunities', 'skillDevelopment', 'communication', 'overallExperience'];
    for (const key of ratingKeys) {
      if (ratings[key] < 1 || ratings[key] > 5) {
        setError('Please provide a rating for all listed aspects.');
        return;
      }
    }

    try {
      await submitEvaluation(internshipId, formData);
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error('Submit evaluation error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to submit evaluation');
    }
  };

  const RatingStars = ({ category, value }) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`text-2xl focus:outline-none transition-transform duration-100 ${
              star <= value ? 'text-yellow-400' : 'text-gray-300'
            } ${submitted ? 'cursor-default' : 'hover:scale-110'}`}
            disabled={submitted}
            onClick={() => !submitted && handleRatingChange(category, star)}
          >
            <FaStar />
          </button>
        ))}
      </div>
    );
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

  const isPending = internshipStatus && (internshipStatus.toLowerCase() === 'pending_verification');
  const isRejected = internshipStatus && (internshipStatus.toLowerCase() === 'rejected');

  if (isPending) {
    return (
      <DashboardLayout userRole="student">
        <div className="max-w-4xl mx-auto mt-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center shadow-sm">
            <div className="flex justify-center mb-4">
              <FaClock className="h-12 w-12 text-yellow-600 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-yellow-900 mb-2">Training Setup Pending Verification</h2>
            <p className="text-yellow-700 max-w-md mx-auto">
              Your training agency and internship details have been submitted and are currently awaiting administrator verification. 
              You will be able to submit evaluation forms once the setup is approved.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isRejected) {
    return (
      <DashboardLayout userRole="student">
        <div className="max-w-4xl mx-auto mt-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center shadow-sm">
            <div className="flex justify-center mb-4">
              <FaExclamationTriangle className="h-12 w-12 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-red-900 mb-2">Training Setup Rejected</h2>
            <p className="text-red-700 max-w-md mx-auto mb-4">
              Your training setup was rejected by the administrator. Please update and resubmit your details under the **Overview** tab.
            </p>
            {rejectionReason && (
              <div className="bg-white border border-red-100 rounded-lg p-4 text-left max-w-md mx-auto shadow-sm">
                <span className="font-bold text-red-950 block mb-1">Rejection Reason:</span>
                <p className="text-sm text-red-800 italic">"{rejectionReason}"</p>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!internshipStatus) {
    return (
      <DashboardLayout userRole="student">
        <div className="max-w-4xl mx-auto mt-8">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-2">No Active Internship Found</h2>
            <p className="text-gray-600 max-w-md mx-auto">
              Please complete and submit your Training Setup form under the **Overview** tab first.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="student">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Training Agency Evaluation</h2>
          <p className="text-gray-600 mb-6">
            Please provide your honest feedback about your OJT experience. Your responses will help improve the program for future students.
          </p>

          {submitted && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
              <p className="font-semibold text-lg">✓ Evaluation Submitted Successfully</p>
              <p className="text-sm text-green-700 mt-1">Thank you for your feedback! Your evaluation response has been securely persisted in the database.</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <p className="font-semibold">Error Submitting Evaluation</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Agency Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Training Agency Name
                </label>
                <input
                  type="text"
                  name="agencyName"
                  value={formData.agencyName}
                  onChange={handleInputChange}
                  className="block w-full px-4 py-3 rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  required
                  disabled={submitted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supervisor Name
                </label>
                <input
                  type="text"
                  name="supervisorName"
                  value={formData.supervisorName}
                  onChange={handleInputChange}
                  className="block w-full px-4 py-3 rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  required
                  disabled={submitted}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Training Period
                </label>
                <input
                  type="text"
                  name="trainingPeriod"
                  value={formData.trainingPeriod}
                  onChange={handleInputChange}
                  placeholder="e.g., January 2023 - June 2023"
                  className="block w-full px-4 py-3 rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  required
                  disabled={submitted}
                />
              </div>
            </div>

            {/* Rating Section */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Please rate the following aspects of your training experience:
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Rating Scale: 1 (Strongly Disagree) to 5 (Strongly Agree)
              </p>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-6 items-center gap-4 py-3 border-b border-gray-200">
                  <div className="md:col-span-3">
                    <p className="font-medium text-gray-800">The work environment was conducive to learning</p>
                  </div>
                  <div className="md:col-span-3">
                    <RatingStars category="workEnvironment" value={formData.ratings.workEnvironment} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 items-center gap-4 py-3 border-b border-gray-200">
                  <div className="md:col-span-3">
                    <p className="font-medium text-gray-800">The supervision and guidance provided was helpful</p>
                  </div>
                  <div className="md:col-span-3">
                    <RatingStars category="supervision" value={formData.ratings.supervision} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 items-center gap-4 py-3 border-b border-gray-200">
                  <div className="md:col-span-3">
                    <p className="font-medium text-gray-800">I was provided with meaningful learning opportunities</p>
                  </div>
                  <div className="md:col-span-3">
                    <RatingStars category="learningOpportunities" value={formData.ratings.learningOpportunities} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 items-center gap-4 py-3 border-b border-gray-200">
                  <div className="md:col-span-3">
                    <p className="font-medium text-gray-800">The experience helped develop my professional skills</p>
                  </div>
                  <div className="md:col-span-3">
                    <RatingStars category="skillDevelopment" value={formData.ratings.skillDevelopment} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 items-center gap-4 py-3 border-b border-gray-200">
                  <div className="md:col-span-3">
                    <p className="font-medium text-gray-800">Communication with the agency was clear and effective</p>
                  </div>
                  <div className="md:col-span-3">
                    <RatingStars category="communication" value={formData.ratings.communication} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 items-center gap-4 py-3 border-b border-gray-200">
                  <div className="md:col-span-3">
                    <p className="font-medium text-gray-800">Overall, I was satisfied with my training experience</p>
                  </div>
                  <div className="md:col-span-3">
                    <RatingStars category="overallExperience" value={formData.ratings.overallExperience} />
                  </div>
                </div>
              </div>
            </div>

            {/* Open-ended Questions */}
            <div className="space-y-6 mt-8">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What were the strengths of this training agency?
                </label>
                <textarea
                  name="strengths"
                  value={formData.strengths}
                  onChange={handleInputChange}
                  rows="3"
                  className="block w-full px-4 py-3 rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  disabled={submitted}
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What areas could be improved?
                </label>
                <textarea
                  name="improvements"
                  value={formData.improvements}
                  onChange={handleInputChange}
                  rows="3"
                  className="block w-full px-4 py-3 rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  disabled={submitted}
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Comments
                </label>
                <textarea
                  name="additionalComments"
                  value={formData.additionalComments}
                  onChange={handleInputChange}
                  rows="3"
                  className="block w-full px-4 py-3 rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  disabled={submitted}
                ></textarea>
              </div>
            </div>

            {/* Submit Button */}
            {!submitted && (
              <div className="flex justify-end mt-8">
                <button
                  type="submit"
                  className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150 ease-in-out font-medium"
                >
                  Submit Evaluation
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Evaluation;