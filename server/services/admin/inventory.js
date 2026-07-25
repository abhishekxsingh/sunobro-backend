const { ProductVariant } = require('../../database/models');
const { STOCK_STATUS, STOCK_THRESHOLD, PAGINATION } = require('../../utils/constant');

const statusForStock = (stock) => {
  if (stock <= STOCK_THRESHOLD.CRITICAL) return STOCK_STATUS.CRITICAL;
  if (stock <= STOCK_THRESHOLD.LOW) return STOCK_STATUS.LOW;

  return STOCK_STATUS.OPTIMAL;
};

const list = async ({ page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * cappedLimit;

  const [variants, count] = await Promise.all([
    ProductVariant.find({})
      .populate('productId', 'name')
      .sort({ stock: 1 })
      .skip(skip)
      .limit(cappedLimit),
    ProductVariant.countDocuments(),
  ]);

  const doc = variants
    .filter((variant) => variant.productId != null)
    .map((variant) => ({
      sku: variant.sku,
      name: `${variant.productId.name} — ${variant.color}/${variant.size}`,
      stock: variant.stock,
      status: statusForStock(variant.stock),
    }));

  return { doc, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

module.exports = { list };
