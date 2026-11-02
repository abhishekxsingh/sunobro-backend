const PaymentService = require('../../services/customer/payment');
const PaymentSettings = require('../../services/customer/payment-settings');
const { STOREFRONT_URL } = require('../../config');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');

const storefront = (path) => `${String(STOREFRONT_URL).replace(/\/$/, '')}${path}`;

const createOrder = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.payments.create,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const result = await PaymentService.createOrder(req.body);

    if (result.type === 'not-configured' || result.type === 'gateway') {
      return res.badRequest(result.type, result.errors);
    }
    if (result.type === 'conflict') {
      return res.conflict('payment-conflict', result.errors);
    }
    if (result.errors) {
      return res.badRequest('field-validation', result.errors);
    }

    return res.getRequest(result.doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const active = async (req, res) => {
  try {
    return res.getRequest(await PaymentSettings.publicActive());
  } catch (error) {
    return res.serverError(error);
  }
};

const hostedReturn = (handler) => async (req, res) => {
  const failed = (message) => {
    const reason = encodeURIComponent(message || 'Payment was not completed.');
    return res.redirect(storefront(`/checkout?payment=failed&reason=${reason}`));
  };
  try {
    const result = await handler(req.body || {});
    if (!result.ok) return failed(result.message);
    const id = encodeURIComponent(result.orderId);
    const ref = encodeURIComponent(result.reference);
    return res.redirect(storefront(`/order-confirmation?id=${id}&ref=${ref}&paid=1`));
  } catch {
    return failed('Payment could not be verified.');
  }
};

const verify = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.payments.verify,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const result = await PaymentService.verify(req.body);

    if (result.type === 'not-configured' || result.type === 'gateway') {
      return res.badRequest(result.type, result.errors);
    }
    if (result.type === 'conflict') {
      return res.conflict('payment-conflict', result.errors);
    }
    if (result.errors) {
      return res.badRequest('field-validation', result.errors);
    }

    return res.getRequest(result.doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const payuReturn = hostedReturn(PaymentService.handlePayuReturn);
const easebuzzReturn = hostedReturn(PaymentService.handleEasebuzzReturn);

module.exports = {
  createOrder, verify, active, payuReturn, easebuzzReturn,
};
