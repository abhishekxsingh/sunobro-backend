const adminService = require('../services/admin-service');

const stats = async (req, res) => {
  res.json(await adminService.stats());
};

const inventory = async (req, res) => {
  res.json(await adminService.inventory());
};

const orders = async (req, res) => {
  res.json(await adminService.orders());
};

module.exports = { stats, inventory, orders };
