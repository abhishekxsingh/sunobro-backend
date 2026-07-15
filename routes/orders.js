const asyncHandler = require('../utils/async-handler');
const { validate } = require('../dto-schemas');
const { requireCustomer, attachCustomerIfPresent } = require('../middleware/auth');
const ordersController = require('../controllers/orders');

module.exports = (router) => {
  router.post('/orders', attachCustomerIfPresent, validate('createOrder'), asyncHandler(ordersController.create));
  // Must be registered before /orders/:id so "me" isn't swallowed as an id.
  router.get('/orders/me', requireCustomer, asyncHandler(ordersController.listMine));
  router.get('/orders/:id', asyncHandler(ordersController.get));
};
