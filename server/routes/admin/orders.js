const AdminOrdersController = require('../../controllers/admin/orders');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/orders', requireAdmin, AdminOrdersController.list);
  router.post('/admin/orders', requireAdmin, AdminOrdersController.create);
  // Manual-order helpers — registered before /:id so they aren't read as ids.
  router.get('/admin/orders/catalog', requireAdmin, AdminOrdersController.catalog);
  router.post('/admin/orders/quote', requireAdmin, AdminOrdersController.quote);
  router.get('/admin/orders/:id', requireAdmin, AdminOrdersController.get);
  router.put('/admin/orders/:id/status', requireAdmin, AdminOrdersController.updateStatus);
  router.post('/admin/orders/:id/qikink/push', requireAdmin, AdminOrdersController.pushToQikink);
  router.post('/admin/orders/:id/qikink/sync', requireAdmin, AdminOrdersController.syncQikink);
};
