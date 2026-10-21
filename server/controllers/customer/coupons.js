const CouponsService = require('../../services/customer/coupons');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');

const validate = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.coupons.validate,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const { doc, errors } = await CouponsService.quote(req.body, req.customer?.sub);
    if (errors) return res.badRequest('coupon-invalid', errors);
    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const available = async (req, res) => {
  try {
    const { doc } = await CouponsService.available(req.customer?.sub);
    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { validate, available };
