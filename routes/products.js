const asyncHandler = require('../utils/async-handler');
const productsController = require('../controllers/products');

module.exports = (router) => {
  router.get('/products', asyncHandler(productsController.list));
  router.get('/products/:idOrSlug', asyncHandler(productsController.get));
};
