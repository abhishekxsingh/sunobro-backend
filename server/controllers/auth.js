const CustomerAuthService = require('../services/customer/auth');
const Schemas = require('../dto-schemas');
const Validator = require('../utils/validator');
const { toCustomerDTO } = require('../utils/serializers');
const { setSessionCookie, clearSessionCookie } = require('../utils/cookies');
const { CUSTOMER_SESSION_COOKIE, FIREBASE } = require('../config');

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

    const { doc, code, errors } = await CustomerAuthService.login(body);

    if (!doc) {
      if (code === 'google') return res.badRequest('google-account', errors);
      return res.unAuthorized();
    }

    setSessionCookie(res, CUSTOMER_SESSION_COOKIE, doc.token);

    return res.getSuccessfully(toCustomerDTO(doc.customer));
  } catch (error) {
    return res.serverError(error);
  }
};

const firebase = async (req, res) => {
  try {
    const { body } = req;
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: body,
      schema: Schemas.customer.auth.firebase,
    });

    if (validationErrors) {
      return res.badRequest('field-validation', validationErrors);
    }

    const { doc, errors, code } = await CustomerAuthService.loginWithFirebase(body);

    if (code === 'unavailable') {
      return res.unavailable('firebase-not-configured', [{
        message: 'Google sign-in is not configured.',
      }]);
    }

    if (!doc) {
      return res.badRequest('firebase-auth', errors);
    }

    setSessionCookie(res, CUSTOMER_SESSION_COOKIE, doc.token);

    return res.getSuccessfully(toCustomerDTO(doc.customer));
  } catch (error) {
    return res.serverError(error);
  }
};

const firebaseConfig = async (req, res) => {
  const configured = FIREBASE.API_KEY && FIREBASE.AUTH_DOMAIN && FIREBASE.PROJECT_ID && FIREBASE.APP_ID;
  if (!configured) {
    return res.unavailable('firebase-not-configured', [{
      message: 'Google sign-in is not configured.',
    }]);
  }

  return res.getSuccessfully({
    apiKey: FIREBASE.API_KEY,
    authDomain: FIREBASE.AUTH_DOMAIN,
    projectId: FIREBASE.PROJECT_ID,
    storageBucket: FIREBASE.STORAGE_BUCKET,
    messagingSenderId: FIREBASE.MESSAGING_SENDER_ID,
    appId: FIREBASE.APP_ID,
    measurementId: FIREBASE.MEASUREMENT_ID,
  });
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
  register, login, firebase, firebaseConfig, logout, me,
};
