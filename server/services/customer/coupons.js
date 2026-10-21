const { ProductVariant, Product } = require('../../database/models');
const CouponService = require('../coupons');

// Cart subtotal from DB prices — the same numbers order creation will use.
const subtotalFor = async (items) => {
  const variants = await ProductVariant.find({ sku: { $in: items.map((i) => i.sku) } });
  const products = await Product.find({ _id: { $in: variants.map((v) => v.productId) } });
  const priceBySku = new Map(variants.map((v) => {
    const product = products.find((p) => String(p._id) === String(v.productId));
    return [v.sku, v.price ?? product?.price];
  }));
  return items.reduce((sum, i) => sum + (priceBySku.get(i.sku) || 0) * i.qty, 0);
};

/** Preview a code against a cart: { code, discount, subtotal, total, summary }. */
const quote = async ({ code, items, email }, customerId) => {
  const subtotal = await subtotalFor(items);
  const result = await CouponService.evaluate(code, {
    subtotal, customerId, email, preview: true,
  });
  if (result.errors) return result;
  const { coupon, discount } = result;
  return {
    doc: {
      ...CouponService.toOfferDTO(coupon),
      discount,
      subtotal,
      total: Number((subtotal - discount).toFixed(2)),
    },
  };
};

const available = (customerId) => CouponService.available({ customerId }).then((doc) => ({ doc }));

module.exports = { quote, available };
