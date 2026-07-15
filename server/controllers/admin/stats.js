const AdminStatsService = require('../../services/admin/stats');

const get = async (req, res) => {
  try {
    const { doc } = await AdminStatsService.get();

    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { get };
