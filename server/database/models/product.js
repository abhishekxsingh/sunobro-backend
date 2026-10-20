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
  // review = new, waiting for an admin to check it; active = on the website;
  // draft = deliberately hidden.
  status: { type: String, enum: ['review', 'active', 'draft'], default: 'review' },
  // Print-on-demand items never run out, so stock is only enforced when on.
  trackInventory: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = model('Product', productSchema);
