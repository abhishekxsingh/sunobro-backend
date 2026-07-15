const {
  sequelize, Customer,
} = require('../../database/models');
const password = require('../../utils/password');
const jwt = require('../../utils/jwt');
const { TOKEN_TYPE } = require('../../utils/constant');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists.';

const register = async (payload) => {
  const {
    name: customerName, email, phone, password: plainPassword,
  } = payload;
  const transaction = await sequelize.transaction();

  try {
    const existing = await Customer.findOne({ where: { email }, transaction });
    if (existing) {
      await transaction.rollback();

      return { errors: [{ name: 'email', message: DUPLICATE_EMAIL_MESSAGE }] };
    }

    const passwordHash = await password.hash(plainPassword);
    const customer = await Customer.create({
      name: customerName, email, phone, passwordHash,
    }, { transaction });

    await transaction.commit();

    const token = jwt.sign({ type: TOKEN_TYPE.CUSTOMER, sub: customer.id });

    return { doc: { customer, token } };
  } catch (error) {
    await transaction.rollback();

    if (error.name === 'SequelizeUniqueConstraintError') {
      return { errors: [{ name: 'email', message: DUPLICATE_EMAIL_MESSAGE }] };
    }

    throw error;
  }
};

const login = async ({ email, password: plainPassword }) => {
  const customer = await Customer.findOne({ where: { email } });
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
  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    return { errors: [{ name: 'customer', message: 'Not authenticated.' }] };
  }

  return { doc: customer };
};

module.exports = {
  register, login, me,
};
