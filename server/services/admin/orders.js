const mongoose = require('mongoose');
const { Order } = require('../../database/models');
const { PAGINATION } = require('../../utils/constant');

const invalidId = (id) => !mongoose.isValidObjectId(id);

const list = async ({ page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * cappedLimit;

  const [orders, count] = await Promise.all([
    Order.find({}).sort({ createdAt: -1 }).skip(skip).limit(cappedLimit),
    Order.countDocuments(),
  ]);

  const doc = orders.map((order) => ({
    ref: order.reference,
    client: `${order.shippingFirstName} ${order.shippingLastName}`,
    value: order.total,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt,
  }));

  return { doc, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

const get = async (orderId) => {
  if (invalidId(orderId)) return { errors: [{ name: 'order', message: 'Order not found.' }] };
  const order = await Order.findById(orderId);
  if (!order) {
    return { errors: [{ name: 'order', message: 'Order not found.' }] };
  }
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
