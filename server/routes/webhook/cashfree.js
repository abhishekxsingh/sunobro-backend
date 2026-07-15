const CashfreeWebhookController = require('../../controllers/webhook/cashfree');

module.exports = (router) => {
  router.post('/webhook/cashfree', CashfreeWebhookController.handle);
};
