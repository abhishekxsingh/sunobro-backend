const { Op } = require('sequelize');
const { Product } = require('../database/models');
const HttpError = require('../utils/http-error');

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const list = () => Product.findAll({ where: { status: 'active' }, order: [['createdAt', 'DESC']] });

const getByIdOrSlug = async (idOrSlug) => {
  const where = isUuid(idOrSlug) ? { [Op.or]: [{ id: idOrSlug }, { slug: idOrSlug }] } : { slug: idOrSlug };
  const product = await Product.findOne({ where: { ...where, status: 'active' } });
  if (!product) throw new HttpError(404, 'Product not found.');
  return product;
};

module.exports = { list, getByIdOrSlug };
