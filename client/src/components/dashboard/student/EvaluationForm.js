import React, { useState } from 'react';
import DashboardLayout from '../DashboardLayout';
import { FaStar } from 'react-icons/fa';

function EvaluationForm() {
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

  const handleSubmit = (e) => {
    e.preventDefault();
    // Here you would submit the form data to your backend
    console.log('Form submitted:', formData);
    alert('Evaluation submitted successfully!');
  };

  const RatingStars = ({ category, value }) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`text-2xl focus:outline-none ${
              star <= value ? 'text-yellow-400' : 'text-gray-300'
            }`}
            onClick={() => handleRatingChange(category, star)}
          >
            <FaStar />
          </button>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout userRole="student">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Training Agency Evaluation</h2>
          <p className="text-gray-600 mb-6">
            Please provide your honest feedback about your OJT experience. Your responses will help improve the program for future students.
          </p>

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
                  className="block w-full px-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
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
                  className="block w-full px-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
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
                  className="block w-full px-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
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
                  className="block w-full px-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                  className="block w-full px-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                  className="block w-full px-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                ></textarea>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end mt-8">
              <button
                type="submit"
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150 ease-in-out"
              >
                Submit Evaluation
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default EvaluationForm; 