const mongoose = require('mongoose');
const { Product, ProductVariant } = require('../../database/models');
const { PAGINATION } = require('../../utils/constant');

const list = async ({ page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * cappedLimit;

  const [rows, count] = await Promise.all([
    Product.find({ status: 'active' }).sort({ createdAt: -1 }).skip(skip).limit(cappedLimit),
    Product.countDocuments({ status: 'active' }),
  ]);

  return { doc: rows, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

const get = async (idOrSlug) => {
  const isId = mongoose.Types.ObjectId.isValid(idOrSlug);
  const filter = isId
    ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }], status: 'active' }
    : { slug: idOrSlug, status: 'active' };

  const product = await Product.findOne(filter);
  if (!product) {
    return { errors: [{ name: 'product', message: 'Product not found.' }] };
  }

  const variants = await ProductVariant.find({ productId: product._id });

  return { doc: product, variants };
};

module.exports = { list, get };
