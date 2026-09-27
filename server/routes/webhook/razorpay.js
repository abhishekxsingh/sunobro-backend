const RazorpayWebhookController = require('../../controllers/webhook/razorpay');

module.exports = (router) => {
  router.post('/webhook/razorpay', RazorpayWebhookController.handle);
};
