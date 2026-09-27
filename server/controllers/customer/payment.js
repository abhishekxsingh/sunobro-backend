const PaymentService = require('../../services/customer/payment');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');

const createOrder = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.payments.create,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const result = await PaymentService.createOrder(req.body);

    if (result.type === 'not-configured') {
      return res.badRequest('not-configured', result.errors);
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

const verify = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.payments.verify,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const result = await PaymentService.verify(req.body);

    if (result.type === 'not-configured') {
      return res.badRequest('not-configured', result.errors);
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

module.exports = { createOrder, verify };
