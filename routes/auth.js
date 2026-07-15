const asyncHandler = require('../utils/async-handler');
const { validate } = require('../dto-schemas');
const { requireCustomer } = require('../middleware/auth');
const customerAuthController = require('../controllers/customer-auth');

module.exports = (router) => {
  router.post('/auth/register', validate('customerRegister'), asyncHandler(customerAuthController.register));
  router.post('/auth/login', validate('customerLogin'), asyncHandler(customerAuthController.login));
  router.post('/auth/logout', asyncHandler(customerAuthController.logout));
  router.get('/auth/me', requireCustomer, asyncHandler(customerAuthController.me));
};
