const CashfreeWebhookService = require('../../services/webhook/cashfree');

const handle = async (req, res) => {
  try {
    const result = await CashfreeWebhookService.handle(req);

    if (result.type === 'unauthorized') return res.unAuthorized();
    if (result.type === 'not-configured') {
      return res.badRequest('not-configured', result.errors);
    }
    if (!result.doc) return res.notImplemented();

    return res.getRequest(result.doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { handle };
