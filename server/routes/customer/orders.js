const OrdersController = require('../../controllers/customer/orders');
const { requireCustomer } = require('../../utils/middleware/auth');

module.exports = (router) => {
  // Checkout needs an account (email or Google): orders, profile and
  // addresses then belong to someone who can track them.
  router.post('/orders', requireCustomer, OrdersController.create);
  // Must be registered before /orders/:id so "me" isn't swallowed as an id.
  router.get('/orders/me', requireCustomer, OrdersController.listMine);
  router.get('/orders/:id', OrdersController.get);
};
