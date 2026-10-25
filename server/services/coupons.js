const mongoose = require('mongoose');
const { Coupon, Order } = require('../database/models');

// Statuses that mean "this customer has really bought something".
const PURCHASED = ['paid', 'shipped', 'delivered'];

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const round2 = (n) => Number(Number(n).toFixed(2));

/**
 * Who a redemption belongs to: the logged-in customer, else the guest's email.
 */
const holderFor = ({ customerId, email }) => {
  if (customerId) return `c:${customerId}`;
  const mail = String(email || '').trim().toLowerCase();
  return mail ? `e:${mail}` : null;
};

/** Discount in ₹ for a subtotal. Never takes the order below ₹1 (Razorpay's minimum). */
const discountFor = (coupon, subtotal) => {
  let discount = coupon.discountType === 'percent'
    ? (subtotal * coupon.value) / 100
    : coupon.value;
  if (coupon.discountType === 'percent' && coupon.maxDiscount != null) {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  return round2(Math.max(0, Math.min(discount, subtotal - 1)));
};

/** Where a coupon stands right now, for the admin list. */
const stateOf = (coupon, now = new Date()) => {
  if (!coupon.active) return 'disabled';
  if (coupon.startsAt && coupon.startsAt > now) return 'scheduled';
  if (coupon.endsAt && coupon.endsAt < now) return 'expired';
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return 'used-up';
  return 'live';
};

const describe = (coupon) => {
  const off = coupon.discountType === 'percent'
    ? `${coupon.value}% off${coupon.maxDiscount != null ? ` (up to ${money(coupon.maxDiscount)})` : ''}`
    : `${money(coupon.value)} off`;
  return coupon.minOrderValue > 0 ? `${off} on orders over ${money(coupon.minOrderValue)}` : off;
};

const fail = (message) => ({ errors: [{ name: 'couponCode', message }] });

/**
 * Can this shopper use this coupon on this subtotal? Checks every rule except
 * the amount, which is computed by discountFor. `excludeOrderId` leaves an
 * order out of the "already used" counts (re-checking an existing order).
 */
const check = async (coupon, {
  subtotal, customerId, email, excludeOrderId, preview = false,
}) => {
  const { code } = coupon;
  const state = stateOf(coupon);
  if (state === 'disabled') return fail(`${code} is not valid.`);
  if (state === 'scheduled') return fail(`${code} isn't active yet.`);
  if (state === 'expired') return fail(`${code} has expired.`);
  if (state === 'used-up') return fail(`${code} has been fully redeemed.`);

  if (coupon.customerIds?.length) {
    if (!customerId) return fail(`Log in to use ${code}.`);
    if (!coupon.customerIds.some((id) => String(id) === String(customerId))) {
      return fail(`${code} isn't available on this account.`);
    }
  }

  if (subtotal < (coupon.minOrderValue || 0)) {
    return fail(`${code} needs an order of at least ${money(coupon.minOrderValue)}.`);
  }

  const holder = holderFor({ customerId, email });
  const notThis = excludeOrderId ? { _id: { $ne: excludeOrderId } } : {};

  // A cart preview may come before the guest has typed an email; the order
  // itself is always checked in full.
  if (coupon.perCustomerLimit != null && (holder || !preview)) {
    if (!holder) return fail(`Add your email to use ${code}.`);
    const used = await Order.countDocuments({
      couponId: coupon._id, couponHolder: holder, couponCounted: true, ...notThis,
    });
    if (used >= coupon.perCustomerLimit) {
      return fail(`You've already used ${code}.`);
    }
  }

  if (coupon.firstOrderOnly) {
    const mail = String(email || '').trim();
    const who = [
      customerId && { customerId },
      mail && { shippingEmail: new RegExp(`^${escapeRegex(mail)}$`, 'i') },
    ].filter(Boolean);
    if (who.length === 0 && preview) return { ok: true };
    if (who.length === 0) return fail(`Add your email to use ${code}.`);
    const before = await Order.exists({ status: { $in: PURCHASED }, $or: who, ...notThis });
    if (before) return fail(`${code} is for your first order only.`);
  }

  return { ok: true };
};

/**
 * Looks a code up and checks it for an order being placed.
 * Returns { coupon, discount, holder } or { errors }.
 */
const evaluate = async (rawCode, {
  subtotal, customerId, email, preview = false,
}) => {
  const code = normalizeCode(rawCode);
  if (!code) return fail('Enter a coupon code.');
  const coupon = await Coupon.findOne({ code });
  if (!coupon) return fail(`${code} is not a valid coupon.`);
  const result = await check(coupon, {
    subtotal, customerId, email, preview,
  });
  if (result.errors) return result;
  return {
    coupon,
    discount: discountFor(coupon, subtotal),
    holder: holderFor({ customerId, email }),
  };
};

/** Re-checks an unpaid order's coupon just before taking payment. */
const recheckOrder = async (order) => {
  if (!order.couponId) return { ok: true };
  const coupon = await Coupon.findById(order.couponId);
  if (!coupon) return fail(`${order.couponCode} is no longer valid.`);
  return check(coupon, {
    subtotal: order.subtotal,
    customerId: order.customerId,
    email: order.shippingEmail,
    excludeOrderId: order._id,
  });
};

/** Counts the order's coupon use once it's paid (or placed as COD). Idempotent. */
const redeem = async (orderId) => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, couponId: { $ne: null }, couponCounted: { $ne: true } },
    { $set: { couponCounted: true } },
  );
  if (order) await Coupon.updateOne({ _id: order.couponId }, { $inc: { usedCount: 1 } });
};

/** Gives a use back when a counted order is cancelled. Idempotent. */
const release = async (orderId) => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, couponCounted: true },
    { $set: { couponCounted: false } },
  );
  if (order) {
    await Coupon.updateOne(
      { _id: order.couponId, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
    );
  }
};

const toOfferDTO = (coupon) => ({
  code: coupon.code,
  name: coupon.name || null,
  description: coupon.description || describe(coupon),
  summary: describe(coupon),
  discountType: coupon.discountType,
  value: coupon.value,
  maxDiscount: coupon.maxDiscount,
  minOrderValue: coupon.minOrderValue || 0,
  endsAt: coupon.endsAt,
  personal: (coupon.customerIds || []).length > 0,
});

/**
 * Offers a shopper can see: public checkout offers plus coupons issued to the
 * logged-in customer that are live and not yet used up by them.
 */
const available = async ({ customerId } = {}) => {
  const now = new Date();
  const live = {
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
  const audience = [{ showAtCheckout: true, customerIds: { $size: 0 } }];
  if (customerId && mongoose.isValidObjectId(customerId)) {
    audience.push({ customerIds: new mongoose.Types.ObjectId(String(customerId)) });
  }
  const coupons = await Coupon.find({ ...live, $or: audience }).sort({ createdAt: -1 }).limit(20);
  const holder = holderFor({ customerId });
  const usable = await Promise.all(coupons.map(async (c) => {
    if (stateOf(c, now) !== 'live') return null;
    if (holder && c.perCustomerLimit != null) {
      const used = await Order.countDocuments({ couponId: c._id, couponHolder: holder, couponCounted: true });
      if (used >= c.perCustomerLimit) return null;
    }
    return c;
  }));
  return usable.filter(Boolean).map(toOfferDTO);
};

module.exports = {
  normalizeCode,
  discountFor,
  stateOf,
  describe,
  holderFor,
  evaluate,
  recheckOrder,
  redeem,
  release,
  available,
  toOfferDTO,
  check,
};
