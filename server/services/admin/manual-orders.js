const mongoose = require('mongoose');
const {
  Coupon, Customer, Product, ProductVariant,
} = require('../../database/models');
const CouponService = require('../coupons');

const round2 = (n) => Number(Number(n).toFixed(2));

/**
 * Everything an admin can put on a manual order: live and in-review products
 * with their switched-on options. Drafts and switched-off options are left
 * out so a manual order never sells something the team hid on purpose.
 */
const catalog = async () => {
  const products = await Product.find({ status: { $in: ['active', 'review'] } })
    .sort({ status: 1, name: 1 })
    .lean();
  const variants = await ProductVariant.find({
    productId: { $in: products.map((p) => p._id) },
    enabled: { $ne: false },
  }).lean();
  const byProduct = new Map();
  variants.forEach((v) => {
    const key = String(v.productId);
    byProduct.set(key, [...(byProduct.get(key) || []), v]);
  });
  return products
    .map((p) => ({
      id: String(p._id),
      name: p.name,
      status: p.status,
      price: p.price,
      image: p.images?.[0] || null,
      qikinkProductId: p.qikinkProductId || null,
      variants: (byProduct.get(String(p._id)) || []).map((v) => ({
        sku: v.sku,
        color: v.color,
        size: v.size,
        price: v.price ?? p.price,
        image: v.image || p.images?.[0] || null,
        mapped: Boolean(v.qikinkSku),
      })),
    }))
    .filter((p) => p.variants.length > 0);
};

const resolveCustomer = async (customerId) => {
  if (!customerId || !mongoose.isValidObjectId(customerId)) return null;
  return Customer.findById(customerId).select('name email phone addresses').lean();
};

/**
 * Coupons an admin could apply for this shopper and cart — public ones plus
 * any issued to this customer, including codes not advertised on the site.
 * Each says what it would save, or why it doesn't apply yet.
 */
const offersFor = async ({ subtotal, customerId, email }) => {
  const now = new Date();
  const coupons = await Coupon.find({
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
    $or: [
      { customerIds: { $size: 0 } },
      ...(customerId ? [{ customerIds: new mongoose.Types.ObjectId(String(customerId)) }] : []),
    ],
  }).limit(50);

  const rows = await Promise.all(coupons.map(async (coupon) => {
    const result = await CouponService.check(coupon, {
      subtotal, customerId, email, preview: !customerId && !email,
    });
    const eligible = !result.errors;
    return {
      ...CouponService.toOfferDTO(coupon),
      kind: coupon.kind,
      eligible,
      reason: eligible ? null : result.errors[0].message,
      saving: eligible ? CouponService.discountFor(coupon, subtotal) : 0,
    };
  }));
  return rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.saving - a.saving);
};

/**
 * Prices a manual order exactly as order creation will: DB prices, the
 * coupon's real discount, and every coupon that could apply instead.
 */
const quote = async ({
  items = [], customerId, email, couponCode,
}) => {
  const customer = await resolveCustomer(customerId);
  const shopperEmail = customer?.email || email || undefined;

  const variants = await ProductVariant.find({ sku: { $in: items.map((i) => i.sku) } }).lean();
  const products = await Product.find({ _id: { $in: variants.map((v) => v.productId) } }).lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const variantBySku = new Map(variants.map((v) => [v.sku, v]));

  const problems = [];
  const lines = [];
  items.forEach((item) => {
    const variant = variantBySku.get(item.sku);
    const product = variant && productById.get(String(variant.productId));
    if (!variant || !product) {
      problems.push(`Unknown option ${item.sku}.`);
      return;
    }
    const price = variant.price ?? product.price;
    if (!variant.qikinkSku) problems.push(`${product.name} ${variant.color}/${variant.size} has no Qikink Store SKU — it can't be printed yet.`);
    if (variant.enabled === false) problems.push(`${product.name} ${variant.color}/${variant.size} is switched off.`);
    lines.push({
      sku: variant.sku,
      name: product.name,
      color: variant.color,
      size: variant.size,
      image: variant.image || product.images?.[0] || null,
      price,
      qty: item.qty,
      lineTotal: round2(price * item.qty),
      mapped: Boolean(variant.qikinkSku),
    });
  });
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));

  let coupon = null;
  let couponError = null;
  let discount = 0;
  if (couponCode && String(couponCode).trim()) {
    const result = await CouponService.evaluate(couponCode, {
      subtotal, customerId: customer?._id, email: shopperEmail, preview: !shopperEmail,
    });
    if (result.errors) couponError = result.errors[0].message;
    else {
      discount = result.discount;
      coupon = { ...CouponService.toOfferDTO(result.coupon), discount };
    }
  }

  return {
    doc: {
      lines,
      subtotal,
      discount,
      total: round2(subtotal - discount),
      coupon,
      couponError,
      problems,
      offers: lines.length
        ? await offersFor({ subtotal, customerId: customer?._id, email: shopperEmail })
        : [],
    },
  };
};

/**
 * The customer a manual order belongs to: the one picked, or — when asked —
 * an account found or created from the shipping email (they can later sign
 * in with Google on that email and see the order).
 */
const customerForOrder = async ({ customerId, createCustomer, shipping }) => {
  if (customerId) {
    const customer = await Customer.findById(customerId);
    if (!customer) return { errors: [{ name: 'customerId', message: 'That customer no longer exists.' }] };
    return { customer };
  }
  if (!createCustomer) return { customer: null };
  const email = String(shipping.email || '').trim().toLowerCase();
  if (!email) return { errors: [{ name: 'shipping.email', message: 'An email is needed to create the customer.' }] };
  let customer = await Customer.findOne({ email });
  if (!customer) {
    try {
      customer = await Customer.create({
        name: `${shipping.firstName} ${shipping.lastName}`.trim(),
        email,
        phone: shipping.phone,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      customer = await Customer.findOne({ email });
    }
  }
  return { customer };
};

const saveAddressTo = async (customer, shipping) => {
  const exists = (customer.addresses || []).some((a) => (
    a.street.trim().toLowerCase() === shipping.street.trim().toLowerCase()
    && a.postalCode.trim() === shipping.postalCode.trim()
  ));
  if (exists) return;
  customer.addresses.push({
    label: 'Home',
    firstName: shipping.firstName,
    lastName: shipping.lastName,
    phone: shipping.phone,
    street: shipping.street,
    city: shipping.city,
    state: shipping.state || '',
    postalCode: shipping.postalCode,
    country: shipping.country || 'India',
    isDefault: customer.addresses.length === 0,
  });
  await customer.save();
};

module.exports = {
  catalog, quote, customerForOrder, saveAddressTo,
};
