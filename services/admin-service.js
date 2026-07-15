const { Op } = require('sequelize');
const { Order, ProductVariant, Product } = require('../database/models');

const DAY_MS = 24 * 60 * 60 * 1000;
const PAID_STATUSES = ['paid', 'shipped', 'delivered'];
const ACTIVE_STATUSES = ['pending', 'paid', 'shipped'];

// No visit/session tracking exists yet, so conversion is approximated as
// paid orders / orders created in the window. Swap for a real analytics
// source later without changing the response shape.
const pctChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const windowStats = async (from, to) => {
  const [revenue, created, paid] = await Promise.all([
    Order.sum('total', { where: { status: { [Op.in]: PAID_STATUSES }, createdAt: { [Op.gte]: from, [Op.lt]: to } } }),
    Order.count({ where: { createdAt: { [Op.gte]: from, [Op.lt]: to } } }),
    Order.count({ where: { status: { [Op.in]: PAID_STATUSES }, createdAt: { [Op.gte]: from, [Op.lt]: to } } }),
  ]);
  return {
    revenue: Number(revenue || 0),
    conversionRatePct: created === 0 ? 0 : Number(((paid / created) * 100).toFixed(1)),
  };
};

const stats = async () => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - DAY_MS);
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY_MS);

  const [current, previous, activeOrders] = await Promise.all([
    windowStats(oneDayAgo, now),
    windowStats(twoDaysAgo, oneDayAgo),
    Order.count({ where: { status: { [Op.in]: ACTIVE_STATUSES } } }),
  ]);

  return {
    grossRevenue24h: current.revenue,
    revenueChangePct: pctChange(current.revenue, previous.revenue),
    activeOrders,
    conversionRatePct: current.conversionRatePct,
    conversionChangePct: pctChange(current.conversionRatePct, previous.conversionRatePct),
  };
};

// Stock thresholds — adjust to match real fulfillment lead times.
const STOCK_CRITICAL = 5;
const STOCK_LOW = 20;

const statusForStock = (stock) => {
  if (stock <= STOCK_CRITICAL) return 'CRITICAL';
  if (stock <= STOCK_LOW) return 'LOW';
  return 'OPTIMAL';
};

const inventory = async () => {
  const variants = await ProductVariant.findAll({
    include: [{ model: Product, as: 'product', attributes: ['name'] }],
    order: [['stock', 'ASC']],
  });

  return variants.map((variant) => ({
    sku: variant.sku,
    name: `${variant.product.name} — ${variant.color}/${variant.size}`,
    stock: variant.stock,
    status: statusForStock(variant.stock),
  }));
};

// QueueOrder only has a two-state status; `delivered` maps to FULFILLED,
// everything else (pending/paid/shipped/cancelled) collapses to PENDING.
const orders = async () => {
  const rows = await Order.findAll({ order: [['createdAt', 'DESC']], limit: 100 });

  return rows.map((order) => ({
    ref: order.reference,
    client: `${order.shippingFirstName} ${order.shippingLastName}`,
    value: Number(order.total),
    currency: order.currency,
    status: order.status === 'delivered' ? 'FULFILLED' : 'PENDING',
  }));
};

module.exports = { stats, inventory, orders };
