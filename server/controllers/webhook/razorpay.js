const { Order } = require('../../database/models');
const { RAZORPAY } = require('../../config');
const PaymentService = require('../../services/customer/payment');
const logger = require('../../utils/logger');

/**
 * Razorpay → us. Every request must carry a valid X-Razorpay-Signature over
 * the raw body, otherwise anyone who knows a Razorpay order id could mark an
 * order paid and trigger a real Qikink print.
 */
const handle = async (req, res) => {
  try {
    const secret = RAZORPAY.WEBHOOK_SECRET || RAZORPAY.KEY_SECRET;
    if (!secret) {
      return res.badRequest('not-configured', [{ message: 'Razorpay webhook secret not configured.' }]);
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!req.rawBody || !PaymentService.hmacMatches(secret, req.rawBody, signature)) {
      logger.warn({ hasSignature: Boolean(signature) }, 'razorpay-webhook-rejected');
      return res.unAuthorized();
    }

    const event = req.body;
    const paymentEntity = event?.payload?.payment?.entity;

    if (event?.event === 'payment.captured' && paymentEntity) {
      const order = await Order.findOne({ razorpayOrderId: paymentEntity.order_id });
      if (order && order.status === 'pending') {
        const expectedPaise = PaymentService.toPaise(order.total);
        const currency = (order.currency || 'INR').toUpperCase();
        if (Number(paymentEntity.amount) !== expectedPaise
          || String(paymentEntity.currency || '').toUpperCase() !== currency) {
          logger.error({
            orderId: order.id,
            amount: paymentEntity.amount,
            currency: paymentEntity.currency,
            expectedPaise,
          }, 'razorpay-webhook-amount-mismatch');
          return res.getRequest({ received: true });
        }
        await PaymentService.markPaidAndFulfill(order, paymentEntity.id);
      }
    }

    return res.getRequest({ received: true });
  } catch (error) {
    logger.error({ err: error }, 'razorpay-webhook-error');
    return res.serverError(error);
  }
};

module.exports = { handle };
