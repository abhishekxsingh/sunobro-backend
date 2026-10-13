const mongoose = require('mongoose');
const { Order } = require('../../database/models');
const { PAGINATION } = require('../../utils/constant');
const QikinkService = require('./qikink');

const toQueueOrder = (order) => ({
  id: order.id,
  ref: order.reference,
  client: `${order.shippingFirstName} ${order.shippingLastName}`,
  value: order.total,
  currency: order.currency,
  status: order.status,
  createdAt: order.createdAt,
  shippingCity: order.shippingCity,
  shippingCountry: order.shippingCountry,
  items: order.items,
  qikinkOrderId: order.qikinkOrderId || null,
  qikinkStatus: order.qikinkStatus || null,
  qikinkError: order.qikinkError || null,
  trackingLink: order.qikinkTrackingLink || null,
  awb: order.qikinkAwb || null,
  courier: order.qikinkCourier || null,
});

const invalidId = (id) => !mongoose.isValidObjectId(id);

const list = async ({ page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * cappedLimit;

  const [orders, count] = await Promise.all([
    Order.find({}).sort({ createdAt: -1 }).skip(skip).limit(cappedLimit),
    Order.countDocuments(),
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
  order.status = status;
  order.statusHistory.push({ status, note: note || '' });
  await order.save();
  return { doc: order };
};

module.exports = { list, get, updateStatus };
