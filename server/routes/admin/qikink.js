const AdminQikinkController = require('../../controllers/admin/qikink');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/qikink/status', requireAdmin, AdminQikinkController.status);
  // SKU readiness on products already in Mongo — not a catalog pull.
  router.post('/admin/qikink/sync-products', requireAdmin, AdminQikinkController.syncProducts);
  // Seed / refresh catalog from My Products CSV (or configured path/URL).
  router.post('/admin/qikink/sync-catalog', requireAdmin, AdminQikinkController.syncCatalog);
  router.post('/admin/qikink/sync-orders', requireAdmin, AdminQikinkController.syncOrders);
};
