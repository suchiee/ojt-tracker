// Service: Phase 2 V2 Evaluation Service
// Connects to PostgreSQL using pg pool.
// Manages retrieval and atomic creation of Student evaluation details.

const pool = require('../../config/pgPool');

const activateRlsSession = async (client, userId) => {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
};

const getStudentEvaluation = async (token, userId, internshipId) => {
  const client = await pool.connect();
  try {
    await activateRlsSession(client, userId);
    
    // Fetch student's evaluation row
    const evalSql = `
      SELECT id, comments, created_at 
      FROM public.evaluations 
      WHERE internship_id = $1 AND evaluator_user_id = $2 AND evaluator_role = 'STUDENT'
      LIMIT 1;
    `;
    const { rows: evalRows } = await client.query(evalSql, [internshipId, userId]);
    if (evalRows.length === 0) {
      return null;
    }
    
    const evaluation = evalRows[0];
    let parsedComments = {};
    try {
      parsedComments = JSON.parse(evaluation.comments);
    } catch (e) {
      parsedComments = { additionalComments: evaluation.comments };
    }

    // Fetch responses linked to questions
    const respSql = `
      SELECT er.score_rating, er.text_response, eq.question_text
      FROM public.evaluation_responses er
      JOIN public.evaluation_questions eq ON er.question_id = eq.id
      WHERE er.evaluation_id = $1;
    `;
    const { rows: respRows } = await client.query(respSql, [evaluation.id]);

    const ratings = {};
    const texts = {};
    
    respRows.forEach(r => {
      if (r.score_rating !== null) {
        ratings[r.question_text] = r.score_rating;
      } else {
        texts[r.question_text] = r.text_response;
      }
    });

    return {
      id: evaluation.id,
      agencyName: parsedComments.agencyName || '',
      supervisorName: parsedComments.supervisorName || '',
      trainingPeriod: parsedComments.trainingPeriod || '',
      ratings: {
        workEnvironment: ratings.workEnvironment || 0,
        supervision: ratings.supervision || 0,
        learningOpportunities: ratings.learningOpportunities || 0,
        skillDevelopment: ratings.skillDevelopment || 0,
        communication: ratings.communication || 0,
        overallExperience: ratings.overallExperience || 0
      },
      strengths: texts.strengths || '',
      improvements: texts.improvements || '',
      additionalComments: texts.additionalComments || parsedComments.additionalComments || '',
      createdAt: evaluation.created_at
    };
  } finally {
    client.release();
  }
};

const submitStudentEvaluation = async (token, userId, internshipId, body) => {
  const { agencyName, supervisorName, trainingPeriod, ratings, strengths, improvements, additionalComments } = body;

  // Validate ratings and open questions
  if (!agencyName || !supervisorName || !trainingPeriod || !ratings) {
    const err = new Error('Missing required fields');
    err.status = 400;
    throw err;
  }

  const expectedRatings = ['workEnvironment', 'supervision', 'learningOpportunities', 'skillDevelopment', 'communication', 'overallExperience'];
  for (const r of expectedRatings) {
    const val = ratings[r];
    if (typeof val !== 'number' || val < 1 || val > 5) {
      const err = new Error(`Rating for ${r} must be a number between 1 and 5`);
      err.status = 400;
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // 1. Verify internship belongs to student, is ACTIVE, and belongs to tenant
    const intSql = `
      SELECT i.id, i.student_id, i.status
      FROM public.internships i
      WHERE i.id = $1
      LIMIT 1;
    `;
    const { rows: intRows } = await client.query(intSql, [internshipId]);
    if (intRows.length === 0) {
      const err = new Error('Internship not found');
      err.status = 404;
      throw err;
    }

    const internship = intRows[0];
    if (internship.student_id !== userId) {
      const err = new Error('Forbidden: Access is restricted to the assigned student');
      err.status = 403;
      throw err;
    }

    if (internship.status !== 'ACTIVE') {
      const err = new Error('Evaluation is only allowed for ACTIVE internships');
      err.status = 400;
      throw err;
    }

    // 2. Verify duplicate evaluation check
    const checkSql = `
      SELECT id FROM public.evaluations 
      WHERE internship_id = $1 AND evaluator_user_id = $2 AND evaluator_role = 'STUDENT'
      LIMIT 1;
    `;
    const { rows: checkRows } = await client.query(checkSql, [internshipId, userId]);
    if (checkRows.length > 0) {
      const err = new Error('Evaluation already submitted for this internship');
      err.status = 400;
      throw err;
    }

    // 3. Insert evaluation row
    const templateId = 'd83c27e8-468b-4a53-8321-df6dfa32b123';
    const commentsJson = JSON.stringify({ agencyName, supervisorName, trainingPeriod });

    const insertEvalSql = `
      INSERT INTO public.evaluations (internship_id, template_id, evaluator_user_id, evaluator_role, comments)
      VALUES ($1, $2, $3, 'STUDENT', $4)
      RETURNING id, created_at;
    `;
    const { rows: evalRows } = await client.query(insertEvalSql, [
      internshipId,
      templateId,
      userId,
      commentsJson
    ]);
    const evalId = evalRows[0].id;

    // 4. Insert evaluation responses
    const responses = [
      { qId: '11111111-1111-1111-1111-111111111111', score: ratings.workEnvironment, text: null },
      { qId: '22222222-2222-2222-2222-222222222222', score: ratings.supervision, text: null },
      { qId: '33333333-3333-3333-3333-333333333333', score: ratings.learningOpportunities, text: null },
      { qId: '44444444-4444-4444-4444-444444444444', score: ratings.skillDevelopment, text: null },
      { qId: '55555555-5555-5555-5555-555555555555', score: ratings.communication, text: null },
      { qId: '66666666-6666-6666-6666-666666666666', score: ratings.overallExperience, text: null },
      { qId: '77777777-7777-7777-7777-777777777777', score: null, text: strengths || '' },
      { qId: '88888888-8888-8888-8888-888888888888', score: null, text: improvements || '' },
      { qId: '99999999-9999-9999-9999-999999999999', score: null, text: additionalComments || '' }
    ];

    const insertRespSql = `
      INSERT INTO public.evaluation_responses (evaluation_id, question_id, score_rating, text_response)
      VALUES ($1, $2, $3, $4);
    `;

    for (const r of responses) {
      await client.query(insertRespSql, [evalId, r.qId, r.score, r.text]);
    }

    await client.query('COMMIT');
    return {
      id: evalId,
      createdAt: evalRows[0].created_at
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  getStudentEvaluation,
  submitStudentEvaluation
};
