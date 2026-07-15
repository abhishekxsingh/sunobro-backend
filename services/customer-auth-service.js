const { Customer } = require('../database/models');
const password = require('../utils/password');
const jwt = require('../utils/jwt');
const HttpError = require('../utils/http-error');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

const register = async ({
  name, email, phone, password: plainPassword,
}) => {
  const existing = await Customer.findOne({ where: { email } });
  if (existing) throw new HttpError(409, 'An account with this email already exists.');

  const passwordHash = await password.hash(plainPassword);
  const customer = await Customer.create({
    name, email, phone, passwordHash,
  });

  const token = jwt.sign({ type: 'customer', sub: customer.id });
  return { customer, token };
};

const login = async ({ email, password: plainPassword }) => {
  const customer = await Customer.findOne({ where: { email } });
  if (!customer) throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);

  const valid = await password.verify(plainPassword, customer.passwordHash);
  if (!valid) throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);

  const token = jwt.sign({ type: 'customer', sub: customer.id });
  return { customer, token };
};

const me = async (customerId) => {
  const customer = await Customer.findByPk(customerId);
  if (!customer) throw new HttpError(401, 'Not authenticated.');
  return customer;
};

module.exports = { register, login, me };
