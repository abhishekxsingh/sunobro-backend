const AdminPaymentsController = require('../../controllers/admin/payments');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/payments', requireAdmin, AdminPaymentsController.get);
  router.put('/admin/payments', requireAdmin, AdminPaymentsController.update);
};
