const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  userName: { type: String, required: true, trim: true },
  userPhone: { type: String, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegularUser' },
  userEmail: { type: String, trim: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quantity: { type: Number, default: 1, min: 1 },
  status: { type: String, default: 'pending', enum: ['pending', 'confirmed', 'cancelled', 'completed'] },
  notes: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Reservation', reservationSchema);
