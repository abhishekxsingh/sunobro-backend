const crypto = require('crypto');
const { Order } = require('../../database/models');
const { RAZORPAY } = require('../../config');
const PaymentService = require('../../services/customer/payment');
const logger = require('../../utils/logger');

const handle = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = RAZORPAY.WEBHOOK_SECRET || RAZORPAY.KEY_SECRET;

    if (!secret) {
      return res.badRequest('not-configured', [{ message: 'Razorpay webhook secret not configured.' }]);
    }

    const rawBody = typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);

    if (signature) {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      if (expected !== signature) {
        return res.unAuthorized();
      }
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventName = event?.event;
    const paymentEntity = event?.payload?.payment?.entity;

    if (eventName === 'payment.captured' && paymentEntity) {
      const razorpayOrderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;
      const order = await Order.findOne({ razorpayOrderId });
      if (order && order.status === 'pending') {
        await PaymentService.markPaidAndFulfill(order, paymentId);
      }
    }

    return res.getRequest({ received: true });
  } catch (error) {
    logger.error({ err: error }, 'razorpay-webhook-error');
    return res.serverError(error);
  }
};

module.exports = { handle };
