const CashfreeWebhookService = require('../../services/webhook/cashfree');

const handle = async (req, res) => {
  try {
    const { doc } = await CashfreeWebhookService.handle(req.body);

    if (!doc) {
      return res.notImplemented();
    }

    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { handle };
