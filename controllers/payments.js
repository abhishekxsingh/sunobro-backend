const paymentService = require('../services/payment-service');

const createOrder = async (req, res) => {
  res.json(await paymentService.createOrder(req.body));
};

const verify = async (req, res) => {
  res.json(await paymentService.verify(req.body));
};

module.exports = { createOrder, verify };
