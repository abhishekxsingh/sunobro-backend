const { Customer } = require('../../database/models');
const password = require('../../utils/password');
const jwt = require('../../utils/jwt');
const { TOKEN_TYPE } = require('../../utils/constant');
const emailService = require('../email');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists.';

const register = async (payload) => {
  const {
    name: customerName, email, phone, password: plainPassword,
  } = payload;

  const existing = await Customer.findOne({ email });
  if (existing) {
    return { errors: [{ name: 'email', message: DUPLICATE_EMAIL_MESSAGE }] };
  }

  const passwordHash = await password.hash(plainPassword);

  let customer;
  try {
    customer = await Customer.create({
      name: customerName, email, phone, passwordHash,
    });
  } catch (err) {
    if (err.code === 11000) {
      return { errors: [{ name: 'email', message: DUPLICATE_EMAIL_MESSAGE }] };
    }
    throw err;
  }

  const token = jwt.sign({ type: TOKEN_TYPE.CUSTOMER, sub: customer.id });

  emailService.sendWelcome({ to: customer.email, name: customer.name }).catch(() => {});

  return { doc: { customer, token } };
};

const login = async ({ email, password: plainPassword }) => {
  const customer = await Customer.findOne({ email });
  if (!customer) {
    return { errors: [{ name: 'credentials', message: INVALID_CREDENTIALS_MESSAGE }] };
  }

  const valid = await password.verify(plainPassword, customer.passwordHash);
  if (!valid) {
    return { errors: [{ name: 'credentials', message: INVALID_CREDENTIALS_MESSAGE }] };
  }

  const token = jwt.sign({ type: TOKEN_TYPE.CUSTOMER, sub: customer.id });

  return { doc: { customer, token } };
};

const me = async (customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    return { errors: [{ name: 'customer', message: 'Not authenticated.' }] };
  }

  return { doc: customer };
};

module.exports = { register, login, me };
