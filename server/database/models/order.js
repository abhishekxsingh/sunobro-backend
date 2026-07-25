const { Schema, model } = require('mongoose');

const orderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  size: { type: String, required: true },
  color: { type: String, required: true },
  sku: { type: String, required: true },
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
  shippingFee: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  currency: { type: String, maxlength: 3, default: 'INR' },
  shippingEmail: { type: String },
  shippingFirstName: { type: String, required: true },
  shippingLastName: { type: String, required: true },
  shippingStreet: { type: String, required: true },
  shippingCity: { type: String, required: true },
  shippingPostalCode: { type: String, required: true },
  shippingCountry: { type: String, required: true },
  destination: { type: String },
  estimatedArrival: { type: String },
  items: { type: [orderItemSchema], default: [] },
  statusHistory: { type: [statusHistorySchema], default: [] },
}, { timestamps: true });

module.exports = model('Order', orderSchema);
