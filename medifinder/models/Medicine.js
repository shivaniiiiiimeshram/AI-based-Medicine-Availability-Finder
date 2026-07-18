const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  price:        { type: Number, required: true, min: 0 },
  stock:        { type: Number, required: true, min: 0 },
  category:     { type: String, required: true, trim: true, lowercase: true },
  pharmacyName: { type: String, required: true, trim: true },
  pharmacistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: {
    lat: { type: Number },
    lng: { type: Number }
  },
  address: { type: String, trim: true }
}, { timestamps: true });

medicineSchema.index({ name: 'text', category: 'text' });

module.exports = mongoose.model('Medicine', medicineSchema);
