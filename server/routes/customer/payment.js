const PaymentController = require('../../controllers/customer/payment');

module.exports = (router) => {
  router.post('/payments/create-order', PaymentController.createOrder);
  router.post('/payments/verify', PaymentController.verify);
};
