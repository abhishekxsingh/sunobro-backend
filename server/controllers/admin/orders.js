const AdminOrdersService = require('../../services/admin/orders');

const list = async (req, res) => {
  try {
    const { query: { page, limit } } = req;
    const { doc, meta } = await AdminOrdersService.list({ page, limit });

    res.setHeader('x-coreplatform-total-records', meta.totalRecords);
    res.setHeader('x-coreplatform-page', meta.page);
    res.setHeader('x-coreplatform-limit', meta.limit);

    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { list };
