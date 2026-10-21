const { Schema, model } = require('mongoose');

// A discount code. `kind` is the admin's label for why it exists (festival,
// seasonal, issued to particular customers, or general); the rules below are
// what actually decide whether an order can use it.
const couponSchema = new Schema({
  code: {
    type: String, required: true, unique: true, uppercase: true, trim: true,
  },
  name: { type: String, default: '' },
  description: { type: String, default: '' },
  kind: {
    type: String,
    enum: ['general', 'festival', 'seasonal', 'customer'],
    default: 'general',
  },
  discountType: { type: String, enum: ['percent', 'flat'], required: true },
  value: { type: Number, required: true, min: 0 },
  // Cap for percent coupons (₹); null = no cap.
  maxDiscount: { type: Number, default: null },
  minOrderValue: { type: Number, default: 0 },
  // Non-empty = only these customers (logged in) can use it.
  customerIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Customer' }], default: [] },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  // Redemptions = paid (or COD) orders. null = unlimited.
  usageLimit: { type: Number, default: null },
  perCustomerLimit: { type: Number, default: 1 },
  usedCount: { type: Number, default: 0 },
  firstOrderOnly: { type: Boolean, default: false },
  // Listed as an offer on the checkout page.
  showAtCheckout: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { timestamps: true });

couponSchema.index({ customerIds: 1 });

module.exports = model('Coupon', couponSchema);
