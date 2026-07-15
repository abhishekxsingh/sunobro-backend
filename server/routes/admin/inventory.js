const AdminInventoryController = require('../../controllers/admin/inventory');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/inventory', requireAdmin, AdminInventoryController.list);
};
