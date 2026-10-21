const auth = require('./auth');
const stats = require('./stats');
const inventory = require('./inventory');
const orders = require('./orders');
const products = require('./products');
const profile = require('./profile');
const qikink = require('./qikink');
const coupons = require('./coupons');
const members = require('./members');
const customers = require('./customers');

module.exports = (router) => {
  auth(router);
  stats(router);
  inventory(router);
  orders(router);
  products(router);
  profile(router);
  qikink(router);
  coupons(router);
  members(router);
  customers(router);
};
