const AdminCouponsController = require('../../controllers/admin/coupons');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/coupons', requireAdmin, AdminCouponsController.list);
  router.post('/admin/coupons', requireAdmin, AdminCouponsController.create);
  router.put('/admin/coupons/:id', requireAdmin, AdminCouponsController.update);
  router.delete('/admin/coupons/:id', requireAdmin, AdminCouponsController.remove);
  router.get('/admin/coupons/:id/redemptions', requireAdmin, AdminCouponsController.redemptions);
  router.get('/admin/customers/search', requireAdmin, AdminCouponsController.searchCustomers);
};
