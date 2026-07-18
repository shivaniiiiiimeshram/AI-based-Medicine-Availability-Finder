const express = require('express');
const router = express.Router();
const RegularUser = require('../models/RegularUser');
const Reservation = require('../models/Reservation');

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await RegularUser.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }
    const user = await RegularUser.create({ username: username.trim(), email, password });
    req.session.regularUserId = user._id;
    req.session.regularUsername = user.username;
    req.session.regularUserEmail = user.email;
    res.json({ success: true, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await RegularUser.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    req.session.regularUserId = user._id;
    req.session.regularUsername = user.username;
    req.session.regularUserEmail = user.email;
    res.json({ success: true, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.regularUserId = null;
  req.session.regularUsername = null;
  req.session.regularUserEmail = null;
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (!req.session.regularUserId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    user: {
      id: req.session.regularUserId,
      username: req.session.regularUsername,
      email: req.session.regularUserEmail
    }
  });
});

router.get('/reservations', async (req, res) => {
  try {
    if (!req.session.regularUserId) {
      return res.status(401).json({ error: 'Login required' });
    }
    const reservations = await Reservation.find({ userId: req.session.regularUserId })
      .populate('medicineId', 'name price category pharmacyName')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ reservations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
