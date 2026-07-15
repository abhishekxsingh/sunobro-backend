const CustomerAuthController = require('../controllers/auth');
const { requireCustomer } = require('../utils/middleware/auth');

module.exports = (router) => {
  router.post('/auth/register', CustomerAuthController.register);
  router.post('/auth/login', CustomerAuthController.login);
  router.post('/auth/logout', CustomerAuthController.logout);
  router.get('/auth/me', requireCustomer, CustomerAuthController.me);
};
