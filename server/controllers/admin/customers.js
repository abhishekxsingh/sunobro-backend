const AdminCustomersService = require('../../services/admin/customers');

const list = async (req, res) => {
  try {
    const { doc, meta } = await AdminCustomersService.list(req.query);
    res.setHeader('x-coreplatform-total-records', meta.totalRecords);
    res.setHeader('x-coreplatform-page', meta.page);
    res.setHeader('x-coreplatform-limit', meta.limit);
    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const get = async (req, res) => {
  try {
    const { doc } = await AdminCustomersService.get(req.params.id);
    return doc ? res.getRequest(doc) : res.notFound();
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { list, get };
