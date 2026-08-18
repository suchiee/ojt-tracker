// Controller: Phase 2 V2 Evaluation Controller
// Thin HTTP adapter: extracts tokens, delegates to service, and shapes JSON response.

const evaluationService = require('../../services/v2/evaluationService');

const getEvaluation = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { id: internshipId } = req.params;

    if (!token || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Missing session tokens' });
    }

    const evaluation = await evaluationService.getStudentEvaluation(token, userId, internshipId);
    
    if (!evaluation) {
      return res.status(404).json({ message: 'Evaluation not found for this internship' });
    }

    res.status(200).json({ data: evaluation });
  } catch (err) {
    console.error('[v2] getEvaluation error:', err.message || err);
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Internal Server Error' });
  }
};

const createEvaluation = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { id: internshipId } = req.params;

    if (!token || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Missing session tokens' });
    }

    const result = await evaluationService.submitStudentEvaluation(token, userId, internshipId, req.body);

    res.status(201).json({
      message: 'Evaluation submitted successfully',
      data: result
    });
  } catch (err) {
    console.error('[v2] createEvaluation error:', err.message || err);
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Internal Server Error' });
  }
};

module.exports = {
  getEvaluation,
  createEvaluation
};
