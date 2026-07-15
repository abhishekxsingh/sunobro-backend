const { Order } = require('../../database/models');
const { ADMIN_ORDER_QUEUE_STATUS, ORDER_STATUS, PAGINATION } = require('../../utils/constant');

// QueueOrder only has a two-state status; `delivered` maps to FULFILLED,
// everything else (pending/paid/shipped/cancelled) collapses to PENDING.
const list = async ({ page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const offset = (currentPage - 1) * cappedLimit;

  const { rows, count } = await Order.findAndCountAll({
    order: [['createdAt', 'DESC']],
    limit: cappedLimit,
    offset,
  });

  const doc = rows.map((order) => ({
    ref: order.reference,
    client: `${order.shippingFirstName} ${order.shippingLastName}`,
    value: Number(order.total),
    currency: order.currency,
    status: order.status === ORDER_STATUS.DELIVERED
      ? ADMIN_ORDER_QUEUE_STATUS.FULFILLED
      : ADMIN_ORDER_QUEUE_STATUS.PENDING,
  }));

  return { doc, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

module.exports = { list };
