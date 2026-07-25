const AdminProfileController = require('../../controllers/admin/profile');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.put('/admin/profile', requireAdmin, AdminProfileController.update);
  router.put('/admin/profile/password', requireAdmin, AdminProfileController.changePassword);
};
