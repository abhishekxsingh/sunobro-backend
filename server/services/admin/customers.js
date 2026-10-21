const mongoose = require('mongoose');
const { Customer, Order } = require('../../database/models');
const { PAGINATION } = require('../../utils/constant');
const { toCustomerDTO } = require('../../utils/serializers');

const PURCHASED = ['paid', 'shipped', 'delivered'];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const page = ({ page: p = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(p) || 1, 1);
  return { limit: cappedLimit, page: currentPage, skip: (currentPage - 1) * cappedLimit };
};

/** Order counts and spend per customer, in one aggregation. */
const statsFor = async (ids) => {
  if (!ids.length) return new Map();
  const rows = await Order.aggregate([
    { $match: { customerId: { $in: ids } } },
    {
      $group: {
        _id: '$customerId',
        orders: { $sum: 1 },
        purchased: { $sum: { $cond: [{ $in: ['$status', PURCHASED] }, 1, 0] } },
        spent: { $sum: { $cond: [{ $in: ['$status', PURCHASED] }, '$total', 0] } },
        lastOrderAt: { $max: '$createdAt' },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

const toRow = (customer, stats) => {
  const s = stats.get(String(customer._id)) || {};
  return {
    ...toCustomerDTO(customer),
    createdAt: customer.createdAt,
    orders: s.orders || 0,
    purchasedOrders: s.purchased || 0,
    totalSpent: Number((s.spent || 0).toFixed(2)),
    lastOrderAt: s.lastOrderAt || null,
  };
};

/**
 * Customers matching `q` — name, email, phone, a saved address (city, PIN,
 * street) or an exact customer id. Newest first.
 */
const list = async ({ q, ...paging } = {}) => {
  const { limit, page: current, skip } = page(paging);
  const term = String(q || '').trim();
  let filter = {};
  if (term) {
    const rx = new RegExp(escape(term), 'i');
    const digits = term.replace(/\D/g, '');
    filter = {
      $or: [
        { name: rx },
        { email: rx },
        { phone: rx },
        ...(digits.length >= 4 ? [{ phone: new RegExp(digits.split('').join('\\D*')) }] : []),
        { 'addresses.city': rx },
        { 'addresses.postalCode': rx },
        { 'addresses.street': rx },
        { 'addresses.phone': rx },
        ...(mongoose.isValidObjectId(term) ? [{ _id: term }] : []),
      ],
    };
  }
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ]);
  const stats = await statsFor(customers.map((c) => c._id));
  return {
    doc: customers.map((c) => toRow(c, stats)),
    meta: { totalRecords: total, page: current, limit },
  };
};

/** One customer with their saved addresses and every order. */
const get = async (id) => {
  if (!mongoose.isValidObjectId(id)) return { errors: [{ name: 'customer', message: 'Not found.' }] };
  const customer = await Customer.findById(id);
  if (!customer) return { errors: [{ name: 'customer', message: 'Not found.' }] };
  const [stats, orders] = await Promise.all([
    statsFor([customer._id]),
    Order.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(200),
  ]);
  return {
    doc: {
      ...toRow(customer, stats),
      orders: orders.map((o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        total: o.total,
        discount: o.discount || 0,
        couponCode: o.couponCode || null,
        currency: o.currency,
        createdAt: o.createdAt,
        items: (o.items || []).map((i) => ({
          name: i.name, size: i.size, color: i.color, qty: i.qty, sku: i.sku,
        })),
        qikinkOrderId: o.qikinkOrderId || null,
        city: o.shippingCity,
      })),
    },
  };
};

module.exports = { list, get };
