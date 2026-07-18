const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Medicine = require('../models/Medicine');

router.post('/', async (req, res) => {
  try {
    const { userName, userPhone, medicineId, quantity, notes } = req.body;
    if (!userName || !medicineId) {
      return res.status(400).json({ error: 'userName and medicineId are required' });
    }
    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
    if (medicine.stock < (quantity || 1)) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    const duplicateQuery = {
      medicineId,
      pharmacyId: medicine.pharmacistId,
      status: 'pending'
    };
    if (req.session.regularUserId) {
      duplicateQuery.userId = req.session.regularUserId;
    } else {
      duplicateQuery.userName = userName.trim();
    }
    const existing = await Reservation.findOne(duplicateQuery);
    if (existing) {
      return res.status(409).json({
        error: 'You already have a pending reservation for this medicine at this pharmacy.',
        alreadyExists: true
      });
    }

    const reservation = new Reservation({
      userName: userName.trim(),
      userPhone: userPhone || '',
      medicineId,
      pharmacyId: medicine.pharmacistId,
      quantity: quantity || 1,
      notes: notes || '',
      userId: req.session.regularUserId || undefined,
      userEmail: req.session.regularUserEmail || undefined
    });
    await reservation.save();
    res.json({ success: true, reservation, message: 'Reservation created successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Login required' });
    }
    const reservations = await Reservation.find({ pharmacyId: req.session.userId })
      .populate('medicineId', 'name price category')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ reservations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
    const { status } = req.body;
    if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const reservation = await Reservation.findOneAndUpdate(
      { _id: req.params.id, pharmacyId: req.session.userId },
      { status },
      { new: true }
    );
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
    res.json({ success: true, reservation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
