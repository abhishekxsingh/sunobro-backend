const AdminAuthController = require('../../controllers/admin/auth');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.post('/admin/auth/login', AdminAuthController.login);
  router.post('/admin/auth/logout', AdminAuthController.logout);
  router.get('/admin/auth/me', requireAdmin, AdminAuthController.me);
};
