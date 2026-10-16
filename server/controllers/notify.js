const NotifyService = require('../services/customer/notify');
const Schemas = require('../dto-schemas');
const Validator = require('../utils/validator');

const subscribe = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.notify.subscribe,
    });

    if (validationErrors) {
      return res.badRequest('field-validation', validationErrors);
    }

    const { doc, errors } = await NotifyService.subscribe(req.body);

    if (!doc) {
      return res.badRequest('notify', errors);
    }

    return res.getSuccessfully({ email: doc.email });
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { subscribe };
