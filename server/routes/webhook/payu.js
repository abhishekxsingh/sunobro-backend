const PayuWebhookController = require('../../controllers/webhook/payu');

module.exports = (router) => {
  router.post('/webhook/payu', PayuWebhookController.handle);
};
