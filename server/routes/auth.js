const CustomerAuthController = require('../controllers/auth');
const AccountController = require('../controllers/customer/account');
const { requireCustomer } = require('../utils/middleware/auth');

module.exports = (router) => {
  router.post('/auth/register', CustomerAuthController.register);
  router.post('/auth/login', CustomerAuthController.login);
  router.get('/auth/firebase-config', CustomerAuthController.firebaseConfig);
  router.post('/auth/firebase', CustomerAuthController.firebase);
  router.post('/auth/logout', CustomerAuthController.logout);
  router.get('/auth/me', requireCustomer, CustomerAuthController.me);
  router.put('/auth/me', requireCustomer, AccountController.updateProfile);
  router.post('/auth/addresses', requireCustomer, AccountController.addAddress);
  router.put('/auth/addresses/:id', requireCustomer, AccountController.updateAddress);
  router.delete('/auth/addresses/:id', requireCustomer, AccountController.removeAddress);
};
