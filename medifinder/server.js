require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = '/medifinder';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(BASE, express.static(path.join(__dirname, 'public')));

app.use(`${BASE}/auth`, require('./routes/auth'));
app.use(`${BASE}/user`, require('./routes/userAuth'));
app.use(`${BASE}/medicine`, require('./routes/medicine'));
app.use(`${BASE}/reservation`, require('./routes/reservation'));
app.use(`${BASE}/scan-image`, require('./routes/scan'));
app.use(`${BASE}/symptom-predict`, require('./routes/predict'));

app.get([BASE, `${BASE}/`, `${BASE}/index.html`], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(`${BASE}/pharmacist`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pharmacist.html'));
});

app.get(`${BASE}/account`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

app.get('/', (req, res) => res.redirect(BASE));

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is not set.');
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.error('ERROR: SESSION_SECRET environment variable is not set.');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`MediFinder running on port ${PORT} at ${BASE}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
