// Validator: Phase 2B.5 Training Setup Validator
// Validates training setup request body parameters.

const validateTrainingSetupBody = (req, res, next) => {
  const { agencyName, mentor, jobRole, startDate, endDate, totalHours } = req.body;

  // Protect against parameter overrides/injections in the body
  const { id, tenant_id, student_id, status, created_at } = req.body;
  if (id || tenant_id || student_id || status || created_at) {
    return res.status(400).json({
      message: 'Invalid request: Overriding system-managed fields (id, tenant_id, student_id, status, created_at) is strictly forbidden'
    });
  }

  // 1. agencyName validation
  if (agencyName === undefined || agencyName === null || typeof agencyName !== 'string') {
    return res.status(400).json({ message: 'Invalid request: agencyName is required and must be a string' });
  }
  const trimmedAgency = agencyName.trim();
  if (trimmedAgency === '') {
    return res.status(400).json({ message: 'Invalid request: agencyName cannot be empty' });
  }
  if (trimmedAgency.length > 255) {
    return res.status(400).json({ message: 'Invalid request: agencyName cannot exceed 255 characters' });
  }
  req.body.agencyName = trimmedAgency;

  // 2. mentor validation (required in UI, string)
  if (mentor === undefined || mentor === null || typeof mentor !== 'string') {
    return res.status(400).json({ message: 'Invalid request: mentor is required and must be a string' });
  }
  const trimmedMentor = mentor.trim();
  if (trimmedMentor === '') {
    return res.status(400).json({ message: 'Invalid request: mentor cannot be empty' });
  }
  if (trimmedMentor.length > 255) {
    return res.status(400).json({ message: 'Invalid request: mentor cannot exceed 255 characters' });
  }
  req.body.mentor = trimmedMentor;

  // 2b. mentorEmail validation
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (req.body.mentorEmail !== undefined && req.body.mentorEmail !== null) {
    if (typeof req.body.mentorEmail !== 'string') {
      return res.status(400).json({ message: 'Invalid request: mentorEmail must be a string' });
    }
    const trimmedEmail = req.body.mentorEmail.trim().toLowerCase();
    if (trimmedEmail !== '' && !EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ message: 'Invalid request: mentorEmail must be a valid email address' });
    }
    req.body.mentorEmail = trimmedEmail || null;
  } else {
    req.body.mentorEmail = null;
  }

  // 3. jobRole validation
  if (jobRole === undefined || jobRole === null || typeof jobRole !== 'string') {
    return res.status(400).json({ message: 'Invalid request: jobRole is required and must be a string' });
  }
  const trimmedRole = jobRole.trim();
  if (trimmedRole === '') {
    return res.status(400).json({ message: 'Invalid request: jobRole cannot be empty' });
  }
  if (trimmedRole.length > 255) {
    return res.status(400).json({ message: 'Invalid request: jobRole cannot exceed 255 characters' });
  }
  req.body.jobRole = trimmedRole;

  // 4. Date validation
  if (!startDate) {
    return res.status(400).json({ message: 'Invalid request: startDate is required' });
  }
  if (!endDate) {
    return res.status(400).json({ message: 'Invalid request: endDate is required' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    return res.status(400).json({ message: 'Invalid request: startDate is invalid' });
  }
  if (isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Invalid request: endDate is invalid' });
  }
  if (start >= end) {
    return res.status(400).json({ message: 'Invalid request: end date must be after start date' });
  }

  // Normalize dates to ISO strings (without timezone offset issues)
  req.body.startDate = start.toISOString().split('T')[0];
  req.body.endDate = end.toISOString().split('T')[0];

  // 5. totalHours validation
  if (totalHours === undefined || totalHours === null) {
    return res.status(400).json({ message: 'Invalid request: totalHours is required' });
  }
  const hoursNum = parseInt(totalHours, 10);
  if (isNaN(hoursNum) || hoursNum <= 0) {
    return res.status(400).json({ message: 'Invalid request: totalHours must be an integer greater than 0' });
  }
  req.body.totalHours = hoursNum;

  next();
};

module.exports = {
  validateTrainingSetupBody
};
