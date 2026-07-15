const asyncHandler = require('../utils/async-handler');
const paymentsController = require('../controllers/payments');

module.exports = (router) => {
  router.post('/payments/create-order', asyncHandler(paymentsController.createOrder));
  router.post('/payments/verify', asyncHandler(paymentsController.verify));
};
