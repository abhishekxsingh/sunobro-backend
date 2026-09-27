const adminAuthLogin = require('./admin/auth/login');
const adminProductsCreate = require('./admin/products/create');
const adminProductsUpdate = require('./admin/products/update');
const adminOrdersUpdateStatus = require('./admin/orders/updateStatus');
const customerAuthRegister = require('./customer/auth/register');
const customerAuthLogin = require('./customer/auth/login');
const customerOrdersSave = require('./customer/orders/save');
const customerPaymentsCreate = require('./customer/payments/create');
const customerPaymentsVerify = require('./customer/payments/verify');

module.exports = {
  admin: {
    auth: { login: adminAuthLogin },
    products: { create: adminProductsCreate, update: adminProductsUpdate },
    orders: { updateStatus: adminOrdersUpdateStatus },
  },
  customer: {
    auth: { register: customerAuthRegister, login: customerAuthLogin },
    orders: { save: customerOrdersSave },
    payments: { create: customerPaymentsCreate, verify: customerPaymentsVerify },
  },
};
