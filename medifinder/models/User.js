const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username:      { type: String, required: true, unique: true, trim: true },
  password:      { type: String, required: true },
  pharmacyName:  { type: String, required: true, trim: true },
  address:       { type: String, trim: true, default: '' },
  lat:           { type: Number },
  lng:           { type: Number },
  contactNumber: { type: String, trim: true, default: '' },
  role:          { type: String, default: 'pharmacist' }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
