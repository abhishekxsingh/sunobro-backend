const adminAuthLogin = require('./admin/auth/login');
const adminProductsCreate = require('./admin/products/create');
const adminProductsUpdate = require('./admin/products/update');
const adminOrdersUpdateStatus = require('./admin/orders/updateStatus');
const adminOrdersCreate = require('./admin/orders/create');
const customerAuthRegister = require('./customer/auth/register');
const customerAuthLogin = require('./customer/auth/login');
const customerAuthFirebase = require('./customer/auth/firebase');
const customerNotifySubscribe = require('./customer/notify');
const customerProfileUpdate = require('./customer/profile');
const customerAddressSave = require('./customer/address');
const customerOrdersSave = require('./customer/orders/save');
const customerPaymentsCreate = require('./customer/payments/create');
const customerPaymentsVerify = require('./customer/payments/verify');

module.exports = {
  admin: {
    auth: { login: adminAuthLogin },
    products: { create: adminProductsCreate, update: adminProductsUpdate },
    orders: { updateStatus: adminOrdersUpdateStatus, create: adminOrdersCreate },
  },
  customer: {
    auth: {
      register: customerAuthRegister,
      login: customerAuthLogin,
      firebase: customerAuthFirebase,
    },
    orders: { save: customerOrdersSave },
    payments: { create: customerPaymentsCreate, verify: customerPaymentsVerify },
    notify: { subscribe: customerNotifySubscribe },
    profile: { update: customerProfileUpdate },
    address: { save: customerAddressSave },
  },
};
