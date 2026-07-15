const AdminInventoryService = require('../../services/admin/inventory');

const list = async (req, res) => {
  try {
    const { query: { page, limit } } = req;
    const { doc, meta } = await AdminInventoryService.list({ page, limit });

    res.setHeader('x-coreplatform-total-records', meta.totalRecords);
    res.setHeader('x-coreplatform-page', meta.page);
    res.setHeader('x-coreplatform-limit', meta.limit);

    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { list };
