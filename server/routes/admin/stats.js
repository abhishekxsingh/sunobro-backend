const AdminStatsController = require('../../controllers/admin/stats');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/stats', requireAdmin, AdminStatsController.get);
};
