const AdminQikinkController = require('../../controllers/admin/qikink');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/qikink/status', requireAdmin, AdminQikinkController.status);
  router.post('/admin/qikink/sync-products', requireAdmin, AdminQikinkController.syncProducts);
  router.post('/admin/qikink/sync-orders', requireAdmin, AdminQikinkController.syncOrders);
};
