const orderService = require('../services/order-service');
const { toOrderDTO } = require('../utils/serializers');

const create = async (req, res) => {
  const order = await orderService.create(req.body, req.customer?.sub);
  res.status(201).json(toOrderDTO(order));
};

const get = async (req, res) => {
  const order = await orderService.getById(req.params.id);
  res.json(toOrderDTO(order));
};

const listMine = async (req, res) => {
  const orders = await orderService.listMine(req.customer.sub);
  res.json(orders.map(toOrderDTO));
};

module.exports = { create, get, listMine };
