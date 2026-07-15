const OrdersController = require('../../controllers/customer/orders');
const { requireCustomer, attachCustomerIfPresent } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.post('/orders', attachCustomerIfPresent, OrdersController.create);
  // Must be registered before /orders/:id so "me" isn't swallowed as an id.
  router.get('/orders/me', requireCustomer, OrdersController.listMine);
  router.get('/orders/:id', OrdersController.get);
};
