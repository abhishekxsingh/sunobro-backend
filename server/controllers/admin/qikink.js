const QikinkService = require('../../services/admin/qikink');

const status = async (req, res) => {
  try {
    return res.getRequest(await QikinkService.getStatus());
  } catch (error) {
    return res.serverError(error);
  }
};

const syncProducts = async (req, res) => {
  try {
    return res.getRequest(await QikinkService.syncAll());
  } catch (error) {
    return res.serverError(error);
  }
};

const syncOrders = async (req, res) => {
  try {
    const { synced } = await QikinkService.syncActiveOrders();
    return res.getRequest({ synced, message: `Refreshed ${synced} in-flight order(s) from Qikink.` });
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { status, syncProducts, syncOrders };
