const ProductsController = require('../../controllers/customer/products');

module.exports = (router) => {
  router.get('/products', ProductsController.list);
  router.get('/products/:idOrSlug', ProductsController.get);
};
