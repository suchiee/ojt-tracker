// Validator: Phase 1E.2 Daily Logs Validator
// Implements strict validation: format checking, timezone-local today checks, 
// decimal safety, trim normalizations, and confused-parent parameter overrides.

const validateUuid = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Verify if string is a valid calendar date (e.g., rejects 2026-02-30)
const isValidCalendarDate = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  
  if (m < 1 || m > 12) return false;
  
  // Date constructor behaves cleanly if we check the returned values
  const dateObj = new Date(y, m - 1, d);
  return (
    dateObj.getFullYear() === y &&
    dateObj.getMonth() === m - 1 &&
    dateObj.getDate() === d
  );
};

// Check if date is in the future relative to local system timezone (institutional today)
const isFutureDate = (dateStr) => {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  
  // Get today's calendar date in local timezone (YYYY-MM-DD)
  const todayLocalStr = new Date().toLocaleDateString('en-CA'); // en-CA format returns YYYY-MM-DD
  const todayParts = todayLocalStr.split('-');
  const ty = parseInt(todayParts[0], 10);
  const tm = parseInt(todayParts[1], 10);
  const td = parseInt(todayParts[2], 10);
  
  if (y > ty) return true;
  if (y === ty) {
    if (m > tm) return true;
    if (m === tm && d > td) return true;
  }
  return false;
};

// Validate individual task hours format (decimal up to 2 places)
const isValidTaskHours = (hours) => {
  if (typeof hours !== 'number' || isNaN(hours) || hours <= 0) return false;
  
  // Check decimal places by string manipulation to avoid floating-point errors
  const hs = hours.toString();
  const dotIndex = hs.indexOf('.');
  if (dotIndex !== -1) {
    const decimals = hs.substring(dotIndex + 1);
    if (decimals.length > 2) return false;
  }
  return true;
};

// Validates UUID path parameters
const validateLogParams = (req, res, next) => {
  const { internshipId, logId } = req.params;

  if (internshipId && !validateUuid(internshipId)) {
    return res.status(400).json({ message: 'Invalid request: Malformed internship UUID' });
  }
  if (logId && !validateUuid(logId)) {
    return res.status(400).json({ message: 'Invalid request: Malformed daily log UUID' });
  }

  // Strictly forbid security-sensitive query params
  const { user_id, student_id, internship_id, tenant_id, role } = req.query;
  if (user_id || student_id || internship_id || tenant_id || role) {
    return res.status(400).json({
      message: 'Invalid request: Direct query override fields are strictly forbidden'
    });
  }

  next();
};

// Validates request body
const validateLogBody = (req, res, next) => {
  const { internshipId, logId } = req.params;
  const isUpdate = req.method === 'PATCH';

  // Protect against confused-parent params in body
  const { status, internship_id, id, created_at, date, notes, tasks } = req.body;
  if (status || internship_id || id || created_at) {
    return res.status(400).json({
      message: 'Invalid request: Overriding status, internship_id, id, or created_at is strictly forbidden'
    });
  }

  // In PATCH, date is immutable
  if (isUpdate && date !== undefined) {
    return res.status(400).json({
      message: 'Invalid request: The date of a daily log is immutable after creation'
    });
  }

  // 1. Validate Date (For POST only)
  if (!isUpdate) {
    if (!date) {
      return res.status(400).json({ message: 'Invalid request: date is required' });
    }
    if (!isValidCalendarDate(date)) {
      return res.status(400).json({ message: 'Invalid request: date must be a valid calendar date in YYYY-MM-DD format' });
    }
    if (isFutureDate(date)) {
      return res.status(400).json({ message: 'Invalid request: cannot log work for future dates' });
    }
  }

  // 2. Validate Notes (Optional in both, if supplied must trim and check size)
  if (notes !== undefined) {
    if (notes !== null && typeof notes !== 'string') {
      return res.status(400).json({ message: 'Invalid request: notes must be a string or null' });
    }
    if (notes) {
      req.body.notes = notes.trim();
      if (req.body.notes.length > 5000) {
        return res.status(400).json({ message: 'Invalid request: notes cannot exceed 5000 characters' });
      }
    }
  }

  // 3. Validate Tasks
  if (isUpdate && notes === undefined && tasks === undefined) {
    return res.status(400).json({ message: 'Invalid request: notes or tasks must be provided for update' });
  }

  if (tasks !== undefined) {
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ message: 'Invalid request: tasks must be an array' });
    }
    if (tasks.length === 0) {
      return res.status(400).json({ message: 'Invalid request: at least one task must be provided' });
    }
    if (tasks.length > 20) {
      return res.status(400).json({ message: 'Invalid request: task count cannot exceed 20' });
    }

    // Decimal safe total hours accumulation using integer scaling
    let totalCents = 0;

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (typeof t !== 'object' || t === null) {
        return res.status(400).json({ message: `Invalid request: task at index ${i} is malformed` });
      }

      const desc = t.description;
      const hrs = t.hours;

      if (desc === undefined || desc === null || typeof desc !== 'string') {
        return res.status(400).json({ message: `Invalid request: task description at index ${i} is required` });
      }
      
      const trimmedDesc = desc.trim();
      if (trimmedDesc === '') {
        return res.status(400).json({ message: `Invalid request: task description at index ${i} cannot be empty or whitespace-only` });
      }
      if (trimmedDesc.length > 500) {
        return res.status(400).json({ message: `Invalid request: task description at index ${i} cannot exceed 500 characters` });
      }

      if (hrs === undefined || hrs === null) {
        return res.status(400).json({ message: `Invalid request: task hours at index ${i} is required` });
      }
      if (!isValidTaskHours(hrs)) {
        return res.status(400).json({ message: `Invalid request: task hours at index ${i} must be a positive number with max 2 decimal places` });
      }
      if (hrs > 24) {
        return res.status(400).json({ message: `Invalid request: task hours at index ${i} cannot exceed 24` });
      }

      totalCents += Math.round(hrs * 100);
      
      // Normalize task in body
      tasks[i] = {
        description: trimmedDesc,
        hours: hrs
      };
    }

    if (totalCents > 2400) {
      return res.status(400).json({ message: 'Invalid request: total task hours cannot exceed 24 per log' });
    }
  }

  next();
};

// Validates log review request body
const validateReviewBody = (req, res, next) => {
  const { decision, feedback, reviewed_by, daily_log_id, id, reviewed_at } = req.body;

  // Protect against parameter injection / metadata overrides
  if (reviewed_by || daily_log_id || id || reviewed_at) {
    return res.status(400).json({
      message: 'Invalid request: Overriding reviewed_by, daily_log_id, id, or reviewed_at is strictly forbidden'
    });
  }

  if (!decision) {
    return res.status(400).json({ message: 'Invalid request: decision is required' });
  }

  if (decision !== 'APPROVED' && decision !== 'CORRECTION_REQUESTED') {
    return res.status(400).json({ message: 'Invalid request: decision must be either APPROVED or CORRECTION_REQUESTED' });
  }

  if (feedback !== undefined && feedback !== null) {
    if (typeof feedback !== 'string') {
      return res.status(400).json({ message: 'Invalid request: feedback must be a string' });
    }
    const trimmedFeedback = feedback.trim();
    if (trimmedFeedback.length > 1000) {
      return res.status(400).json({ message: 'Invalid request: feedback cannot exceed 1000 characters' });
    }
    req.body.feedback = trimmedFeedback;
  }

  if (decision === 'CORRECTION_REQUESTED') {
    if (!feedback || feedback.trim() === '') {
      return res.status(400).json({ message: 'Invalid request: feedback comment is required for correction requests' });
    }
  }

  next();
};

// Validates query parameters for the mentor review queue
const validateReviewQueueParams = (req, res, next) => {
  const { page, limit, student_id, internship_id, date, user_id, tenant_id, role } = req.query;

  // Strict: Reject overrides
  if (user_id || tenant_id || role) {
    return res.status(400).json({
      message: 'Invalid request: Direct query override fields are strictly forbidden'
    });
  }

  if (page) {
    const pageVal = parseInt(page, 10);
    if (isNaN(pageVal) || pageVal < 1) {
      return res.status(400).json({ message: 'Invalid request: page must be a positive integer' });
    }
  }

  if (limit) {
    const limitVal = parseInt(limit, 10);
    if (isNaN(limitVal) || limitVal < 1 || limitVal > 100) {
      return res.status(400).json({ message: 'Invalid request: limit must be an integer between 1 and 100' });
    }
  }

  if (student_id && !validateUuid(student_id)) {
    return res.status(400).json({ message: 'Invalid request: Malformed student_id UUID' });
  }

  if (internship_id && !validateUuid(internship_id)) {
    return res.status(400).json({ message: 'Invalid request: Malformed internship_id UUID' });
  }

  if (date && !isValidCalendarDate(date)) {
    return res.status(400).json({ message: 'Invalid request: date filter must be a valid calendar date in YYYY-MM-DD format' });
  }

  next();
};

module.exports = {
  validateLogParams,
  validateLogBody,
  validateReviewBody,
  validateReviewQueueParams
};
