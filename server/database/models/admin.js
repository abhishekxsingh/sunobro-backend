const { Schema, model } = require('mongoose');

const adminSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'ops'], default: 'admin' },
}, { timestamps: true });

module.exports = model('Admin', adminSchema);
