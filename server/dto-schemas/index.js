const adminAuthLogin = require('./admin/auth/login');
const customerAuthRegister = require('./customer/auth/register');
const customerAuthLogin = require('./customer/auth/login');
const customerOrdersSave = require('./customer/orders/save');

module.exports = {
  admin: {
    auth: { login: adminAuthLogin },
  },
  customer: {
    auth: { register: customerAuthRegister, login: customerAuthLogin },
    orders: { save: customerOrdersSave },
  },
};
