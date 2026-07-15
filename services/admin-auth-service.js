const { Admin } = require('../database/models');
const password = require('../utils/password');
const jwt = require('../utils/jwt');
const HttpError = require('../utils/http-error');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

const login = async ({ email, password: plainPassword }) => {
  const admin = await Admin.findOne({ where: { email } });
  if (!admin) throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);

  const valid = await password.verify(plainPassword, admin.passwordHash);
  if (!valid) throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);

  const token = jwt.sign({ type: 'admin', sub: admin.id, role: admin.role });
  return { admin, token };
};

const me = async (adminId) => {
  const admin = await Admin.findByPk(adminId);
  if (!admin) throw new HttpError(401, 'Not authenticated.');
  return admin;
};

module.exports = { login, me };
