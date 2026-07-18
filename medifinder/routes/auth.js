const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/register', async (req, res) => {
  try {
    const { username, password, pharmacyName, address, lat, lng, contactNumber } = req.body;
    if (!username || !password || !pharmacyName) {
      return res.status(400).json({ error: 'Username, password and pharmacy name are required' });
    }
    if (lat == null || lat === '' || lng == null || lng === '') {
      return res.status(400).json({ error: 'Pharmacy latitude and longitude are required' });
    }
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || parsedLat < -90  || parsedLat > 90)  return res.status(400).json({ error: 'Invalid latitude (must be -90 to 90)' });
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) return res.status(400).json({ error: 'Invalid longitude (must be -180 to 180)' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const user = new User({
      username,
      password,
      pharmacyName,
      address:       address       || '',
      lat:           parsedLat,
      lng:           parsedLng,
      contactNumber: contactNumber || ''
    });
    await user.save();

    req.session.userId       = user._id;
    req.session.pharmacyName = user.pharmacyName;
    res.json({ success: true, message: 'Registered successfully', pharmacyName: user.pharmacyName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId       = user._id;
    req.session.pharmacyName = user.pharmacyName;
    res.json({ success: true, message: 'Logged in', pharmacyName: user.pharmacyName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  try {
    const user = await User.findById(req.session.userId).select('-password -__v').lean();
    if (!user) return res.json({ loggedIn: false });
    res.json({
      loggedIn:      true,
      pharmacyName:  user.pharmacyName,
      address:       user.address       || '',
      lat:           user.lat,
      lng:           user.lng,
      contactNumber: user.contactNumber || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  try {
    const { pharmacyName, address, lat, lng, contactNumber } = req.body;
    const update = {};

    if (pharmacyName && pharmacyName.trim()) update.pharmacyName = pharmacyName.trim();
    if (address  !== undefined) update.address       = address.trim();
    if (contactNumber !== undefined) update.contactNumber = contactNumber.trim();

    if (lat !== undefined && lat !== '') {
      const parsedLat = parseFloat(lat);
      if (isNaN(parsedLat) || parsedLat < -90  || parsedLat > 90)  return res.status(400).json({ error: 'Invalid latitude' });
      update.lat = parsedLat;
    }
    if (lng !== undefined && lng !== '') {
      const parsedLng = parseFloat(lng);
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) return res.status(400).json({ error: 'Invalid longitude' });
      update.lng = parsedLng;
    }

    const user = await User.findByIdAndUpdate(req.session.userId, update, { new: true }).select('-password -__v').lean();
    if (update.pharmacyName) req.session.pharmacyName = user.pharmacyName;
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
