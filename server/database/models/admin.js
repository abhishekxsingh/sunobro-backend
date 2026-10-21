const { Schema, model } = require('mongoose');

const adminSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  // admin = everything incl. managing the team; ops = everything else.
  role: { type: String, enum: ['admin', 'ops'], default: 'admin' },
  // Deactivated members can't sign in, and their open sessions stop working.
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

module.exports = model('Admin', adminSchema);
