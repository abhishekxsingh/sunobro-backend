const { ProductVariant, Product } = require('../../database/models');
const { STOCK_STATUS, STOCK_THRESHOLD, PAGINATION } = require('../../utils/constant');

// Stock thresholds — adjust to match real fulfillment lead times.
const statusForStock = (stock) => {
  if (stock <= STOCK_THRESHOLD.CRITICAL) return STOCK_STATUS.CRITICAL;
  if (stock <= STOCK_THRESHOLD.LOW) return STOCK_STATUS.LOW;

  return STOCK_STATUS.OPTIMAL;
};

const list = async ({ page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const offset = (currentPage - 1) * cappedLimit;

  const { rows, count } = await ProductVariant.findAndCountAll({
    include: [{ model: Product, as: 'product', attributes: ['name'] }],
    order: [['stock', 'ASC']],
    limit: cappedLimit,
    offset,
  });

  const doc = rows.map((variant) => ({
    sku: variant.sku,
    name: `${variant.product.name} — ${variant.color}/${variant.size}`,
    stock: variant.stock,
    status: statusForStock(variant.stock),
  }));

  return { doc, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

module.exports = { list };
