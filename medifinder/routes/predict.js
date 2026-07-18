const express = require('express');
const axios   = require('axios');

const router  = express.Router();
const ML_API  = process.env.ML_API_URL || 'http://localhost:5000';

router.post('/', async (req, res) => {
  const { symptom } = req.body;
  if (!symptom || !String(symptom).trim()) {
    return res.status(400).json({ error: 'Please provide a symptom.' });
  }

  try {
    const { data } = await axios.post(`${ML_API}/predict`, {
      symptom: String(symptom).trim()
    });
    res.json({
      symptom:    data.symptom,
      medicine:   data.medicine,
      confidence: data.confidence
    });
  } catch (err) {
    const status = err.response ? err.response.status : 503;
    res.status(status).json({
      error: 'ML service unavailable. Make sure the Python ML API is running on port 5000.'
    });
  }
});

module.exports = router;
