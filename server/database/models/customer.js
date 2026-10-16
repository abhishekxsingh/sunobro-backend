const { Schema, model } = require('mongoose');

const addressSchema = new Schema({
  label: { type: String, default: 'Home' },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, default: '' },
  postalCode: { type: String, required: true },
  country: { type: String, default: 'India' },
  isDefault: { type: Boolean, default: false },
});

const customerSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  passwordHash: { type: String },
  firebaseUid: { type: String, unique: true, sparse: true },
  addresses: { type: [addressSchema], default: [] },
}, { timestamps: true });

module.exports = model('Customer', customerSchema);
