const { Schema, model } = require('mongoose');

const customerSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

module.exports = model('Customer', customerSchema);
