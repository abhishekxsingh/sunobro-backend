const { Op } = require('sequelize');
const { Product } = require('../../database/models');
const { PAGINATION } = require('../../utils/constant');

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const list = async ({ page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const offset = (currentPage - 1) * cappedLimit;

  const { rows, count } = await Product.findAndCountAll({
    where: { status: 'active' },
    order: [['createdAt', 'DESC']],
    limit: cappedLimit,
    offset,
  });

  return { doc: rows, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

const get = async (idOrSlug) => {
  const where = isUuid(idOrSlug) ? { [Op.or]: [{ id: idOrSlug }, { slug: idOrSlug }] } : { slug: idOrSlug };
  const product = await Product.findOne({ where: { ...where, status: 'active' } });

  if (!product) {
    return { errors: [{ name: 'product', message: 'Product not found.' }] };
  }

  return { doc: product };
};

module.exports = { list, get };
