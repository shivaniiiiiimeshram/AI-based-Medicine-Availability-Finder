const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const User = require('../models/User');

function bigramSimilarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const aBigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    aBigrams.set(bg, (aBigrams.get(bg) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = aBigrams.get(bg) || 0;
    if (count > 0) {
      aBigrams.set(bg, count - 1);
      hits++;
    }
  }
  return (2.0 * hits) / (a.length + b.length - 2);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

router.get('/search', async (req, res) => {
  try {
    const { name, lat, lng, distance, symptom } = req.query;
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const maxKm = parseFloat(distance) || 10;

    const hasLocation = !isNaN(userLat) && !isNaN(userLng);

    if (!name && !symptom) {
      return res.status(400).json({ error: 'Provide medicine name or symptom' });
    }

    if (lat !== undefined && (isNaN(userLat) || userLat < -90 || userLat > 90)) {
      return res.status(400).json({ error: 'Invalid lat: must be a number between -90 and 90' });
    }
    if (lng !== undefined && (isNaN(userLng) || userLng < -180 || userLng > 180)) {
      return res.status(400).json({ error: 'Invalid lng: must be a number between -180 and 180' });
    }
    if (isNaN(maxKm) || maxKm <= 0 || maxKm > 20000) {
      return res.status(400).json({ error: 'Invalid distance: must be a positive number up to 20000 km' });
    }

    let results = [];
    let suggestions = [];
    let symptomResults = [];
    let searchMode = 'none';

    if (name && name.trim()) {
      const trimmed = name.trim();
      const exactOrPartial = await Medicine.find({
        name: { $regex: trimmed, $options: 'i' },
        stock: { $gt: 0 }
      }).populate('pharmacistId', 'address lat lng contactNumber pharmacyName').lean();

      if (exactOrPartial.length > 0) {
        searchMode = 'found';
        results = exactOrPartial;
      } else {
        searchMode = 'suggestion';
        const allMeds = await Medicine.find({ stock: { $gt: 0 } }, 'name').lean();
        const query = trimmed.toLowerCase();
        const words = query.split(/\s+/);

        const scored = allMeds.map(m => {
          const mName = m.name.toLowerCase();
          let score = 0;
          for (const w of words) {
            if (mName.includes(w)) score += w.length * 2;
            if (mName.startsWith(w)) score += w.length;
          }
          const sim = bigramSimilarity(query, mName);
          if (sim > 0.35) score += sim * 10;
          return { name: m.name, score };
        }).filter(m => m.score > 0).sort((a, b) => b.score - a.score);

        suggestions = [...new Set(scored.map(m => m.name))].slice(0, 5);
      }
    }

    if (symptom && symptom.trim() && searchMode !== 'found') {
      const trimmedSymptom = symptom.trim();
      const symptomMatch = await Medicine.find({
        $or: [
          { category: { $regex: trimmedSymptom, $options: 'i' } },
          { name:     { $regex: trimmedSymptom, $options: 'i' } }
        ],
        stock: { $gt: 0 }
      }).populate('pharmacistId', 'address lat lng contactNumber pharmacyName').lean();
      symptomResults = symptomMatch;
      if (symptomMatch.length > 0) searchMode = 'symptom';
    }

    const allCandidates = searchMode === 'symptom' ? symptomResults : results;

    // Resolve location from pharmacy profile (preferred) or stored medicine location (fallback for legacy data)
    const withResolvedLocation = allCandidates.map(m => {
      const pharmacy = m.pharmacistId;
      const resolvedLat = (pharmacy && pharmacy.lat != null) ? pharmacy.lat : (m.location && m.location.lat);
      const resolvedLng = (pharmacy && pharmacy.lng != null) ? pharmacy.lng : (m.location && m.location.lng);
      const resolvedAddress = (pharmacy && pharmacy.address) ? pharmacy.address : (m.address || '');
      return { ...m, resolvedLat, resolvedLng, resolvedAddress };
    });

    let filtered = withResolvedLocation.filter(m => m.resolvedLat != null && m.resolvedLng != null);
    let distanceFallback = false;

    if (hasLocation && filtered.length > 0) {
      const withDistance = filtered.map(m => {
        const dist = haversineKm(userLat, userLng, m.resolvedLat, m.resolvedLng);
        return { ...m, distanceKm: parseFloat(dist.toFixed(2)) };
      });
      const withinRange = withDistance.filter(m => m.distanceKm <= maxKm).sort((a, b) => a.distanceKm - b.distanceKm);

      if (withinRange.length > 0) {
        filtered = withinRange;
      } else {
        filtered = withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
        distanceFallback = true;
      }
    }

    res.json({
      searchMode,
      results: filtered,
      suggestions,
      symptomResults: searchMode === 'symptom' ? filtered : [],
      distanceFallback,
      requestedDistance: maxKm
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/add', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });

    const { name, price, stock, category } = req.body;
    if (!name || price == null || stock == null || !category) {
      return res.status(400).json({ error: 'Medicine name, price, stock and category are required' });
    }

    // Fetch pharmacy profile for location
    const pharmacist = await User.findById(req.session.userId).lean();
    if (!pharmacist) return res.status(401).json({ error: 'Pharmacist not found' });
    if (pharmacist.lat == null || pharmacist.lng == null) {
      return res.status(400).json({ error: 'Your pharmacy location is not set. Please update your profile with latitude and longitude first.' });
    }

    const medicine = new Medicine({
      name:         name.trim(),
      price:        parseFloat(price),
      stock:        parseInt(stock),
      category:     category.trim().toLowerCase(),
      pharmacyName: pharmacist.pharmacyName,
      pharmacistId: req.session.userId,
      location:     { lat: pharmacist.lat, lng: pharmacist.lng },
      address:      pharmacist.address || ''
    });
    await medicine.save();
    res.json({ success: true, medicine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
    const medicines = await Medicine.find({ pharmacistId: req.session.userId }).sort({ createdAt: -1 }).lean();
    res.json({ medicines });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
