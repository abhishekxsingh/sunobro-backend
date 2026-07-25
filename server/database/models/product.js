const { Schema, model } = require('mongoose');

const productSchema = new Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  currency: { type: String, maxlength: 3, default: 'INR' },
  images: { type: [String], default: [] },
  sizes: { type: [String], default: [] },
  inStock: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'draft'], default: 'active' },
}, { timestamps: true });

module.exports = model('Product', productSchema);
