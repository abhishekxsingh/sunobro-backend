const { Schema, model } = require('mongoose');

const productVariantSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  size: { type: String, required: true },
  color: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  stock: { type: Number, required: true, default: 0 },
  price: { type: Number },
  qikinkSku: { type: String },
}, { timestamps: true });

module.exports = model('ProductVariant', productVariantSchema);
