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
  // From dashboard fetch_my_products → client_product_id (S3 folder id).
  // Also used as the My Products export Product ID when CSV-imported.
  qikinkProductId: { type: String, index: true },
  // Dashboard asset folder id (clients/<id>/…) from fetch_my_products.client_id.
  qikinkClientId: { type: String },
  // Dashboard internal product_id (numeric string) when provided.
  qikinkDashboardProductId: { type: String },
  qikinkDesign: { type: String },
  qikinkPrintSize: { type: String },
  qikinkColourCount: { type: Number },
  qikinkSizeRange: { type: String },
  qikinkExpectedVariants: { type: Number },
}, { timestamps: true });

module.exports = model('Product', productSchema);
