const { Schema, model } = require('mongoose');

const settingSchema = new Schema({
  key: { type: String, required: true, unique: true },
  activeGateway: {
    type: String,
    enum: ['razorpay', 'payu', 'easebuzz', 'cashfree'],
    default: 'payu',
  },
}, { timestamps: true });

module.exports = model('Setting', settingSchema);
