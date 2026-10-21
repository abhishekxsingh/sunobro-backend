const AdminCustomersController = require('../../controllers/admin/customers');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/customers', requireAdmin, AdminCustomersController.list);
  // /admin/customers/search (coupons picker) is registered in ./coupons.
  router.get('/admin/customers/:id', requireAdmin, AdminCustomersController.get);
};
