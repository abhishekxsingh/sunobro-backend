const auth = require('./auth');
const stats = require('./stats');
const inventory = require('./inventory');
const orders = require('./orders');

module.exports = (router) => {
  auth(router);
  stats(router);
  inventory(router);
  orders(router);
};
