const { Schema, model } = require('mongoose');

const orderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  size: { type: String, required: true },
  color: { type: String, required: true },
  sku: { type: String, required: true },
  qikinkSku: { type: String },
  price: { type: Number, required: true },
  qty: { type: Number, required: true },
}, { _id: false });

const statusHistorySchema = new Schema({
  status: { type: String, required: true },
  note: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const orderSchema = new Schema({
  reference: { type: String, required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  status: {
    type: String,
    enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  subtotal: { type: Number, required: true },
  // Coupon applied at checkout; `discount` is already taken off `total`.
  // couponCounted flips once the order is paid (or COD) so a redemption is
  // counted exactly once, and back if the order is cancelled.
  couponId: { type: Schema.Types.ObjectId, ref: 'Coupon' },
  couponCode: { type: String },
  couponHolder: { type: String },
  couponCounted: { type: Boolean, default: false },
  discount: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  currency: { type: String, maxlength: 3, default: 'INR' },
  shippingEmail: { type: String },
  shippingPhone: { type: String },
  shippingFirstName: { type: String, required: true },
  shippingLastName: { type: String, required: true },
  shippingStreet: { type: String, required: true },
  shippingCity: { type: String, required: true },
  shippingState: { type: String },
  shippingPostalCode: { type: String, required: true },
  shippingCountry: { type: String, required: true },
  destination: { type: String },
  estimatedArrival: { type: String },
  items: { type: [orderItemSchema], default: [] },
  statusHistory: { type: [statusHistorySchema], default: [] },
  // razorpay / payu / easebuzz / cashfree = storefront checkout (whichever is
  // active in admin settings). manual = prepaid collected offline by an admin.
  // cod = cash on delivery collected by Qikink.
  paymentGateway: { type: String, default: 'razorpay' },
  source: { type: String, enum: ['storefront', 'admin'], default: 'storefront' },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  payuTxnId: { type: String },
  payuPaymentId: { type: String },
  payuRefundId: { type: String },
  payuRefundStatus: { type: String },
  payuRefundAmount: { type: Number },
  payuDisputeId: { type: String },
  payuDisputeStatus: { type: String },
  payuDisputeAmount: { type: Number },
  payuDisputeReason: { type: String },
  cashfreeOrderId: { type: String },
  cashfreePaymentId: { type: String },
  easebuzzTxnId: { type: String },
  easebuzzPaymentId: { type: String },
  qikinkOrderId: { type: String },
  qikinkOrderNumber: { type: String },
  qikinkStatus: { type: String },
  qikinkError: { type: String },
  qikinkAwb: { type: String },
  qikinkTrackingLink: { type: String },
  qikinkCourier: { type: String },
  qikinkAttempts: { type: Number, default: 0 },
  qikinkLastAttemptAt: { type: Date },
  qikinkSyncedAt: { type: Date },
}, { timestamps: true });

orderSchema.index({ status: 1, qikinkStatus: 1 });
orderSchema.index({ couponId: 1, couponHolder: 1, couponCounted: 1 });

module.exports = model('Order', orderSchema);
