const CustomerAuthService = require('../services/customer/auth');
const Schemas = require('../dto-schemas');
const Validator = require('../utils/validator');
const { toCustomerDTO } = require('../utils/serializers');
const { setSessionCookie, clearSessionCookie } = require('../utils/cookies');
const { CUSTOMER_SESSION_COOKIE } = require('../config');

const register = async (req, res) => {
  try {
    const { body } = req;
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: body,
      schema: Schemas.customer.auth.register,
    });

    if (validationErrors) {
      return res.badRequest('field-validation', validationErrors);
    }

    const { doc, errors } = await CustomerAuthService.register(body);

    if (!doc) {
      return res.conflict('duplicate-email', errors);
    }

    setSessionCookie(res, CUSTOMER_SESSION_COOKIE, doc.token);

    return res.postSuccessfully(toCustomerDTO(doc.customer));
  } catch (error) {
    return res.serverError(error);
  }
};

const login = async (req, res) => {
  try {
    const { body } = req;
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: body,
      schema: Schemas.customer.auth.login,
    });

    if (validationErrors) {
      return res.badRequest('field-validation', validationErrors);
    }

    const { doc } = await CustomerAuthService.login(body);

    if (!doc) {
      return res.unAuthorized();
    }

    setSessionCookie(res, CUSTOMER_SESSION_COOKIE, doc.token);

    return res.getSuccessfully(toCustomerDTO(doc.customer));
  } catch (error) {
    return res.serverError(error);
  }
};

const logout = async (req, res) => {
  try {
    clearSessionCookie(res, CUSTOMER_SESSION_COOKIE);

    return res.deleted();
  } catch (error) {
    return res.serverError(error);
  }
};

const me = async (req, res) => {
  try {
    const { customer: { sub: customerId } } = req;
    const { doc } = await CustomerAuthService.me(customerId);

    if (!doc) {
      return res.unAuthorized();
    }

    return res.getRequest(toCustomerDTO(doc));
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = {
  register, login, logout, me,
};
