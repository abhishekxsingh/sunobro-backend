const { Schema, model } = require('mongoose');

const productVariantSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  size: { type: String, required: true },
  color: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  stock: { type: Number, required: true, default: 0 },
  price: { type: Number },
  qikinkSku: { type: String },
  // Mockup for this variant's colour; shown on the product page when the
  // colour is picked. Empty means the product's cover image.
  image: { type: String },
  // Switched off by an admin (whole colour or one size): hidden from the
  // storefront and not orderable. Survives sheet re-imports.
  enabled: { type: Boolean, default: true },
  // What Qikink charges for this variant (₹, incl. shipping & tax) — for margins.
  qikinkCost: { type: Number },
}, { timestamps: true });

module.exports = model('ProductVariant', productVariantSchema);
