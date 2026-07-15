const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const ajvErrors = require('ajv-errors');
const HttpError = require('../utils/http-error');

const adminLogin = require('./admin-login');
const customerRegister = require('./customer-register');
const customerLogin = require('./customer-login');
const createOrder = require('./create-order');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
ajvErrors(ajv);

const schemas = {
  adminLogin,
  customerRegister,
  customerLogin,
  createOrder,
};

const validators = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]),
);

const validate = (schemaName) => (req, res, next) => {
  const validator = validators[schemaName];
  const valid = validator(req.body);
  if (!valid) {
    const message = validator.errors.map((e) => e.message).join('; ');
    return next(new HttpError(400, message || 'Invalid request body.'));
  }
  return next();
};

module.exports = { schemas, validate };
