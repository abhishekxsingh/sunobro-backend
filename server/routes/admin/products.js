const AdminProductsController = require('../../controllers/admin/products');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/products', requireAdmin, AdminProductsController.list);
  // bulk must be registered before /:id so Express matches it first
  router.post('/admin/products/bulk', requireAdmin, AdminProductsController.bulkCreate);
  router.get('/admin/products/:id', requireAdmin, AdminProductsController.get);
  router.post('/admin/products', requireAdmin, AdminProductsController.create);
  router.put('/admin/products/:id', requireAdmin, AdminProductsController.update);
  router.delete('/admin/products/:id', requireAdmin, AdminProductsController.remove);
  router.post('/admin/products/:id/sync-qikink', requireAdmin, AdminProductsController.syncQikink);
};
