const PaymentController = require('../../controllers/customer/payment');

module.exports = (router) => {
  router.get('/payments/active', PaymentController.active);
  router.post('/payments/create-order', PaymentController.createOrder);
  router.post('/payments/verify', PaymentController.verify);
  router.post('/payments/payu/callback', PaymentController.payuReturn);
  router.post('/payments/easebuzz/callback', PaymentController.easebuzzReturn);
};
