const asyncHandler = require('../utils/async-handler');
const { validate } = require('../dto-schemas');
const { requireAdmin } = require('../middleware/auth');
const adminAuthController = require('../controllers/admin-auth');
const adminController = require('../controllers/admin');

module.exports = (router) => {
  router.post('/admin/auth/login', validate('adminLogin'), asyncHandler(adminAuthController.login));
  router.post('/admin/auth/logout', asyncHandler(adminAuthController.logout));
  router.get('/admin/auth/me', requireAdmin, asyncHandler(adminAuthController.me));

  router.get('/admin/stats', requireAdmin, asyncHandler(adminController.stats));
  router.get('/admin/inventory', requireAdmin, asyncHandler(adminController.inventory));
  router.get('/admin/orders', requireAdmin, asyncHandler(adminController.orders));
};
