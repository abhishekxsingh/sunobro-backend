const mongoose = require('mongoose');
const { Coupon, Customer, Order } = require('../../database/models');
const CouponService = require('../coupons');

const notFound = { errors: [{ name: 'coupon', message: 'Coupon not found.' }] };
const invalid = (name, message) => ({ type: 'field-validation', errors: [{ name, message }] });

const toAdminDTO = (coupon, customers = new Map()) => ({
  id: coupon.id,
  code: coupon.code,
  name: coupon.name,
  description: coupon.description,
  kind: coupon.kind,
  discountType: coupon.discountType,
  value: coupon.value,
  maxDiscount: coupon.maxDiscount,
  minOrderValue: coupon.minOrderValue,
  customers: (coupon.customerIds || []).map((id) => customers.get(String(id)) || { id: String(id) }),
  startsAt: coupon.startsAt,
  endsAt: coupon.endsAt,
  usageLimit: coupon.usageLimit,
  perCustomerLimit: coupon.perCustomerLimit,
  usedCount: coupon.usedCount,
  firstOrderOnly: coupon.firstOrderOnly,
  showAtCheckout: coupon.showAtCheckout,
  active: coupon.active,
  state: CouponService.stateOf(coupon),
  summary: CouponService.describe(coupon),
  createdAt: coupon.createdAt,
  updatedAt: coupon.updatedAt,
});

const customerCard = (c) => ({
  id: c.id, name: c.name, email: c.email, phone: c.phone || null,
});

const withCustomers = async (coupons) => {
  const ids = [...new Set(coupons.flatMap((c) => (c.customerIds || []).map(String)))];
  const found = ids.length ? await Customer.find({ _id: { $in: ids } }).select('name email phone') : [];
  return new Map(found.map((c) => [c.id, customerCard(c)]));
};

/** Cross-field rules the JSON schema can't express. */
const checkRules = (data) => {
  if (data.discountType === 'percent' && data.value > 100) {
    return invalid('value', 'A percent discount can be at most 100.');
  }
  if (data.startsAt && data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
    return invalid('endsAt', 'The end date must be after the start date.');
  }
  if (data.kind === 'customer' && !(data.customerIds || []).length) {
    return invalid('customerIds', 'Pick at least one customer for a customer coupon.');
  }
  return null;
};

const clean = (body) => {
  const data = { ...body };
  if (data.code !== undefined) data.code = CouponService.normalizeCode(data.code);
  ['startsAt', 'endsAt'].forEach((k) => {
    if (data[k] !== undefined) data[k] = data[k] ? new Date(data[k]) : null;
  });
  if (data.discountType === 'flat') data.maxDiscount = null;
  return data;
};

const unknownCustomers = async (ids = []) => {
  if (!ids.length) return [];
  const found = await Customer.find({ _id: { $in: ids } }).select('_id');
  const known = new Set(found.map((c) => String(c._id)));
  return ids.filter((id) => !known.has(String(id)));
};

const list = async () => {
  const coupons = await Coupon.find({}).sort({ createdAt: -1 });
  const customers = await withCustomers(coupons);
  return { doc: coupons.map((c) => toAdminDTO(c, customers)) };
};

const save = async (id, body) => {
  const data = clean(body);
  let coupon = null;
  if (id) {
    if (!mongoose.isValidObjectId(id)) return notFound;
    coupon = await Coupon.findById(id);
    if (!coupon) return notFound;
  }
  const merged = { ...(coupon ? coupon.toObject() : {}), ...data };
  merged.customerIds = (merged.customerIds || []).map(String);
  const ruleError = checkRules(merged);
  if (ruleError) return ruleError;

  const missing = await unknownCustomers(data.customerIds);
  if (missing.length) return invalid('customerIds', `Unknown customer id: ${missing.join(', ')}`);

  if (data.code) {
    const clash = await Coupon.exists({ code: data.code, ...(coupon ? { _id: { $ne: coupon._id } } : {}) });
    if (clash) return { type: 'conflict', errors: [{ name: 'code', message: `${data.code} already exists.` }] };
  }

  if (coupon) {
    if (data.code && data.code !== coupon.code && coupon.usedCount > 0) {
      return invalid('code', 'This coupon has been used — its code can no longer change.');
    }
    coupon.set(data);
    await coupon.save();
  } else {
    coupon = await Coupon.create(data);
  }
  const customers = await withCustomers([coupon]);
  return { doc: toAdminDTO(coupon, customers) };
};

const remove = async (id) => {
  if (!mongoose.isValidObjectId(id)) return notFound;
  const coupon = await Coupon.findById(id);
  if (!coupon) return notFound;
  const onOrders = await Order.exists({ couponId: coupon._id });
  if (onOrders) {
    return {
      type: 'conflict',
      errors: [{ name: 'coupon', message: `${coupon.code} is on existing orders — switch it off instead of deleting.` }],
    };
  }
  await coupon.deleteOne();
  return { doc: { id } };
};

/** Orders that used a coupon, newest first. */
const redemptions = async (id) => {
  if (!mongoose.isValidObjectId(id)) return notFound;
  const orders = await Order.find({ couponId: id })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('reference status total discount shippingFirstName shippingLastName shippingEmail couponCounted createdAt');
  return {
    doc: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      total: o.total,
      discount: o.discount,
      client: `${o.shippingFirstName} ${o.shippingLastName}`,
      email: o.shippingEmail || null,
      counted: o.couponCounted,
      createdAt: o.createdAt,
    })),
  };
};

/** Customer lookup for issuing coupons: name, email or phone, or an exact id. */
const searchCustomers = async (q) => {
  const term = String(q || '').trim();
  if (term.length < 2) return { doc: [] };
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  if (mongoose.isValidObjectId(term)) or.push({ _id: term });
  const customers = await Customer.find({ $or: or }).select('name email phone').limit(10);
  return { doc: customers.map(customerCard) };
};

module.exports = {
  list, save, remove, redemptions, searchCustomers,
};
