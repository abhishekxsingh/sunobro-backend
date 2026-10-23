const PaymentSettings = require('../../services/customer/payment-settings');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');

const get = async (req, res) => {
  try {
    return res.getRequest(await PaymentSettings.snapshot());
  } catch (error) {
    return res.serverError(error);
  }
};

const update = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.admin.payments.update,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const result = await PaymentSettings.setActive(req.body.activeGateway);
    if (result.type === 'not-configured') {
      return res.badRequest('not-configured', result.errors);
    }
    if (result.errors) return res.badRequest('field-validation', result.errors);
    return res.getRequest(result.doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { get, update };
