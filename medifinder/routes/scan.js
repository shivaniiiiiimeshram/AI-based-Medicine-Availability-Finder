const express  = require('express');
const multer   = require('multer');
const axios    = require('axios');
const FormData = require('form-data');
const Medicine = require('../models/Medicine');

const router  = express.Router();
const upload  = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }  // 5 MB max
});

const ML_API = 'http://localhost:5000';

// ── Helper: clean OCR text and extract candidate medicine names ───────────────
function extractMedicineCandidates(rawText) {
  // Remove dosage patterns (500mg, 10ml, 2g, etc.), digits, special chars
  const cleaned = rawText
    .replace(/\b\d+\s*(mg|ml|g|mcg|iu|%)\b/gi, '')  // remove dosages
    .replace(/[^a-zA-Z\s]/g, ' ')                     // keep only letters
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Split into words and filter short ones
  const words = cleaned.split(/\s+/).filter(w => w.length >= 3);

  // Build candidate phrases: individual words + consecutive word pairs
  const candidates = new Set(words);
  for (let i = 0; i < words.length - 1; i++) {
    candidates.add(`${words[i]} ${words[i + 1]}`);
  }

  return Array.from(candidates);
}

// ── POST /scan-image ──────────────────────────────────────────────────────────
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded. Please attach an image file.' });
  }

  // ── Step 1: Send image to Python OCR service ──────────────────────────────
  let ocrText = '';
  try {
    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename:    req.file.originalname || 'upload.jpg',
      contentType: req.file.mimetype     || 'image/jpeg'
    });

    const ocrRes = await axios.post(`${ML_API}/scan`, form, {
      headers: form.getHeaders(),
      timeout: 15000
    });

    if (!ocrRes.data.detected || !ocrRes.data.text) {
      return res.json({
        success:    false,
        ocrText:    '',
        message:    'Could not detect any text. Try a clearer image.',
        results:    []
      });
    }

    ocrText = ocrRes.data.text;
  } catch (err) {
    const msg = err.code === 'ECONNREFUSED'
      ? 'OCR service is not running. Please try again later.'
      : `OCR error: ${err.message}`;
    return res.status(502).json({ error: msg });
  }

  // ── Step 2: Match OCR text against medicine names in database ─────────────
  const candidates = extractMedicineCandidates(ocrText);

  let detectedMedicine = null;
  let dbResults = [];

  if (candidates.length > 0) {
    // Build a regex that matches any candidate word/phrase
    const regexParts = candidates
      .sort((a, b) => b.length - a.length)  // try longer phrases first
      .map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const combinedRegex = regexParts.join('|');

    const matched = await Medicine.find({
      name:  { $regex: combinedRegex, $options: 'i' },
      stock: { $gt: 0 }
    }).populate('pharmacistId', 'address lat lng contactNumber pharmacyName').lean();

    if (matched.length > 0) {
      // Resolve pharmacy location (same logic as medicine search route)
      dbResults = matched.map(m => {
        const pharmacy = m.pharmacistId;
        return {
          ...m,
          resolvedLat:     (pharmacy && pharmacy.lat != null) ? pharmacy.lat : (m.location && m.location.lat),
          resolvedLng:     (pharmacy && pharmacy.lng != null) ? pharmacy.lng : (m.location && m.location.lng),
          resolvedAddress: (pharmacy && pharmacy.address)     ? pharmacy.address : (m.address || '')
        };
      });

      // Pick the most likely detected medicine name from results
      detectedMedicine = dbResults[0].name;
    }
  }

  // ── Step 3: Return response ───────────────────────────────────────────────
  if (dbResults.length === 0) {
    return res.json({
      success:          false,
      ocrText,
      detectedMedicine: null,
      message:          'No matching medicine found in database. Try searching manually.',
      results:          []
    });
  }

  return res.json({
    success:          true,
    ocrText,
    detectedMedicine,
    message:          `Found ${dbResults.length} result(s) for "${detectedMedicine}"`,
    results:          dbResults
  });
});

module.exports = router;
