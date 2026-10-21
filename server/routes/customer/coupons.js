const CouponsController = require('../../controllers/customer/coupons');
const { attachCustomerIfPresent } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/coupons/available', attachCustomerIfPresent, CouponsController.available);
  router.post('/coupons/validate', attachCustomerIfPresent, CouponsController.validate);
};
