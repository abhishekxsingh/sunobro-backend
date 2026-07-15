const { Op } = require('sequelize');
const { Order } = require('../../database/models');
const { PAID_ORDER_STATUSES, ACTIVE_ORDER_STATUSES } = require('../../utils/constant');

const DAY_MS = 24 * 60 * 60 * 1000;

const pctChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : 100;

  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const windowStats = async (from, to) => {
  const [revenue, created, paid] = await Promise.all([
    Order.sum('total', {
      where: { status: { [Op.in]: PAID_ORDER_STATUSES }, createdAt: { [Op.gte]: from, [Op.lt]: to } },
    }),
    Order.count({ where: { createdAt: { [Op.gte]: from, [Op.lt]: to } } }),
    Order.count({
      where: { status: { [Op.in]: PAID_ORDER_STATUSES }, createdAt: { [Op.gte]: from, [Op.lt]: to } },
    }),
  ]);

  return {
    revenue: Number(revenue || 0),
    conversionRatePct: created === 0 ? 0 : Number(((paid / created) * 100).toFixed(1)),
  };
};

// No visit/session tracking exists yet, so conversion is approximated as
// paid orders / orders created in the window. Swap for a real analytics
// source later without changing the response shape.
const get = async () => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - DAY_MS);
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY_MS);

  const [current, previous, activeOrders] = await Promise.all([
    windowStats(oneDayAgo, now),
    windowStats(twoDaysAgo, oneDayAgo),
    Order.count({ where: { status: { [Op.in]: ACTIVE_ORDER_STATUSES } } }),
  ]);

  return {
    doc: {
      grossRevenue24h: current.revenue,
      revenueChangePct: pctChange(current.revenue, previous.revenue),
      activeOrders,
      conversionRatePct: current.conversionRatePct,
      conversionChangePct: pctChange(current.conversionRatePct, previous.conversionRatePct),
    },
  };
};

module.exports = { get };
