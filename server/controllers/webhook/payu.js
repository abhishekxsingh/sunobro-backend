const PayuWebhookService = require('../../services/webhook/payu');
const logger = require('../../utils/logger');

const handle = async (req, res) => {
  try {
    const result = await PayuWebhookService.handle(req);
    if (result.type === 'unauthorized') return res.unAuthorized();
    return res.getRequest(result.doc);
  } catch (error) {
    if (error.retry) {
      logger.warn({ err: error }, 'payu-webhook-retry');
      return res.serverError(error);
    }
    logger.error({ err: error }, 'payu-webhook-error');
    return res.serverError(error);
  }
};

module.exports = { handle };
