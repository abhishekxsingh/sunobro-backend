const AdminOrdersController = require('../../controllers/admin/orders');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/orders', requireAdmin, AdminOrdersController.list);
  router.get('/admin/orders/:id', requireAdmin, AdminOrdersController.get);
  router.put('/admin/orders/:id/status', requireAdmin, AdminOrdersController.updateStatus);
};
