const auth = require('./auth');
const stats = require('./stats');
const inventory = require('./inventory');
const orders = require('./orders');
const products = require('./products');
const profile = require('./profile');

module.exports = (router) => {
  auth(router);
  stats(router);
  inventory(router);
  orders(router);
  products(router);
  profile(router);
};
