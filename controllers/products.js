const productService = require('../services/product-service');
const { toProductDTO } = require('../utils/serializers');

const list = async (req, res) => {
  const products = await productService.list();
  res.json(products.map(toProductDTO));
};

const get = async (req, res) => {
  const product = await productService.getByIdOrSlug(req.params.idOrSlug);
  res.json(toProductDTO(product));
};

module.exports = { list, get };
