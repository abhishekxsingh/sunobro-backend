const mongoose = require('mongoose');

const connect = async (uri) => mongoose.connect(uri);

const Admin = require('./admin');
const Customer = require('./customer');
const Product = require('./product');
const ProductVariant = require('./product-variant');
const Order = require('./order');
const Subscriber = require('./subscriber');

module.exports = {
  connect,
  Admin,
  Customer,
  Product,
  ProductVariant,
  Order,
  Subscriber,
};
