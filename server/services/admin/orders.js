const mongoose = require('mongoose');
const { Order } = require('../../database/models');
const { PAGINATION } = require('../../utils/constant');
const QikinkService = require('./qikink');
const emailService = require('../email');
const CustomerOrdersService = require('../customer/orders');
const CouponService = require('../coupons');

const toQueueOrder = (order) => ({
  id: order.id,
  ref: order.reference,
  client: `${order.shippingFirstName} ${order.shippingLastName}`,
  customerId: order.customerId ? String(order.customerId) : null,
  email: order.shippingEmail || null,
  phone: order.shippingPhone || null,
  value: order.total,
  subtotal: order.subtotal,
  discount: order.discount || 0,
  couponCode: order.couponCode || null,
  currency: order.currency,
  status: order.status,
  createdAt: order.createdAt,
  shippingCity: order.shippingCity,
  shippingCountry: order.shippingCountry,
  items: order.items,
  qikinkOrderId: order.qikinkOrderId || null,
  qikinkStatus: order.qikinkStatus || null,
  qikinkError: order.qikinkError || null,
  trackingLink: (order.qikinkAwb && order.qikinkTrackingLink) || null,
  awb: order.qikinkAwb || null,
  courier: order.qikinkCourier || null,
  paymentGateway: order.paymentGateway || 'razorpay',
  source: order.source || 'storefront',
  qikinkAttempts: order.qikinkAttempts || 0,
  qikinkSyncedAt: order.qikinkSyncedAt || null,
});

const invalidId = (id) => !mongoose.isValidObjectId(id);

const ORDER_SEARCH_FIELDS = [
  'reference', 'shippingFirstName', 'shippingLastName', 'shippingEmail', 'shippingPhone',
  'shippingCity', 'shippingPostalCode', 'items.name', 'items.sku', 'items.qikinkSku', 'items.color',
  'qikinkOrderId', 'qikinkAwb', 'couponCode', 'razorpayPaymentId',
];
const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

/**
 * Every word of `q` must match some field: "riya black" finds Riya's orders
 * with a black tee; also order ref, email, phone, product, SKU, AWB, coupon.
 */
const searchFilter = (q, status) => {
  const filter = {};
  if (ORDER_STATUSES.includes(status)) filter.status = status;
  const words = String(q || '').trim().split(/\s+/).filter(Boolean)
    .slice(0, 5);
  if (words.length) {
    filter.$and = words.map((word) => {
      const rx = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return { $or: ORDER_SEARCH_FIELDS.map((field) => ({ [field]: rx })) };
    });
  }
  return filter;
};

const list = async ({
  page = 1, limit = PAGINATION.DEFAULT_LIMIT, q, status,
} = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * cappedLimit;
  const filter = searchFilter(q, status);

  const [orders, count] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(cappedLimit),
    Order.countDocuments(filter),
  ]);

  await QikinkService.syncOrders(orders);
  return {
    doc: orders.map(toQueueOrder),
    meta: { totalRecords: count, page: currentPage, limit: cappedLimit },
  };
};

const get = async (orderId) => {
  if (invalidId(orderId)) return { errors: [{ name: 'order', message: 'Order not found.' }] };
  const order = await Order.findById(orderId);
  if (!order) {
    return { errors: [{ name: 'order', message: 'Order not found.' }] };
  }
  await QikinkService.syncOrder(order);
  return { doc: order };
};

const updateStatus = async (orderId, { status, note }) => {
  if (invalidId(orderId)) return { errors: [{ name: 'order', message: 'Order not found.' }] };
  const order = await Order.findById(orderId);
  if (!order) {
    return { errors: [{ name: 'order', message: 'Order not found.' }] };
  }
  const previous = order.status;
  // Qikink has no cancel API — a pushed order must also be cancelled in the
  // Qikink dashboard, so say so on the order's history.
  const needsQikinkCancel = status === 'cancelled' && order.qikinkOrderId;
  const historyNote = needsQikinkCancel
    ? [note, `Cancel Qikink order ${order.qikinkOrderId} in the Qikink dashboard.`].filter(Boolean).join(' ')
    : note || '';
  order.status = status;
  order.statusHistory.push({ status, note: historyNote });
  await order.save();
  if (status === 'cancelled') await CouponService.release(order._id);
  else if (['paid', 'shipped', 'delivered'].includes(status)) await CouponService.redeem(order._id);
  if (previous !== status && order.shippingEmail) {
    emailService.sendOrderStatus({ to: order.shippingEmail, order }).catch(() => {});
  }
  return { doc: order, warning: needsQikinkCancel ? historyNote : undefined };
};

/**
 * Orders taken outside the storefront (WhatsApp, Instagram, phone). Prepaid =
 * money already collected, so the order starts paid; COD stays pending until
 * Qikink delivers and collects. Either way it can go straight to Qikink.
 */
const create = async ({
  items, shipping, paymentMethod, note, couponCode, pushToQikink: push = true,
}) => {
  const result = await CustomerOrdersService.create({ items, shipping, couponCode }, null, {
    source: 'admin',
    paymentGateway: paymentMethod === 'cod' ? 'cod' : 'manual',
    allowDraft: true,
  });
  if (!result.doc) return result;

  const createdNote = paymentMethod === 'cod'
    ? 'Created by admin — cash on delivery (collected by Qikink).'
    : 'Created by admin — payment collected offline.';
  const update = {
    $push: {
      statusHistory: {
        status: paymentMethod === 'cod' ? 'pending' : 'paid',
        note: [createdNote, note].filter(Boolean).join(' '),
        createdAt: new Date(),
      },
    },
  };
  if (paymentMethod !== 'cod') update.$set = { status: 'paid' };
  let order = await Order.findByIdAndUpdate(result.doc._id, update, { new: true });
  // Prepaid is paid now; COD is a committed order too — both count as a use.
  await CouponService.redeem(order._id);

  if (push) {
    const fulfilled = await QikinkService.fulfillOrder(order._id);
    order = fulfilled.order || order;
  }
  return { doc: toQueueOrder(order) };
};

const pushToQikink = async (orderId) => {
  if (invalidId(orderId)) return { errors: [{ name: 'order', message: 'Order not found.' }] };
  const existing = await Order.findById(orderId);
  if (!existing) return { errors: [{ name: 'order', message: 'Order not found.' }] };
  if (existing.qikinkOrderId) {
    return {
      type: 'conflict',
      errors: [{ name: 'qikinkOrderId', message: `Already on Qikink as ${existing.qikinkOrderId}.` }],
    };
  }
  if (!QikinkService.isPushable(existing)) {
    return {
      type: 'conflict',
      errors: [{ name: 'status', message: `Only paid or COD orders can be pushed (order is ${existing.status}).` }],
    };
  }
  if (!QikinkService.isConfigured()) {
    return {
      type: 'conflict',
      errors: [{ name: 'qikink', message: 'Qikink credentials are not configured on the server.' }],
    };
  }

  const { order, pushed } = await QikinkService.fulfillOrder(existing._id);
  if (!pushed && order?.qikinkStatus === QikinkService.FULFILMENT.SUBMITTING) {
    return {
      type: 'conflict',
      errors: [{ name: 'qikink', message: 'A push for this order is already in progress.' }],
    };
  }
  return { doc: toQueueOrder(order) };
};

const syncQikink = async (orderId) => {
  if (invalidId(orderId)) return { errors: [{ name: 'order', message: 'Order not found.' }] };
  const order = await Order.findById(orderId);
  if (!order) return { errors: [{ name: 'order', message: 'Order not found.' }] };
  if (!order.qikinkOrderId) {
    return {
      type: 'conflict',
      errors: [{ name: 'qikinkOrderId', message: 'Order has not been pushed to Qikink yet.' }],
    };
  }
  await QikinkService.syncOrder(order, { force: true });
  return { doc: toQueueOrder(order) };
};

module.exports = {
  list, get, create, updateStatus, pushToQikink, syncQikink, toQueueOrder,
};
