const { Admin } = require('../../database/models');
const password = require('../../utils/password');
const jwt = require('../../utils/jwt');
const { TOKEN_TYPE } = require('../../utils/constant');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

const login = async ({ email, password: plainPassword }) => {
  const admin = await Admin.findOne({ email });
  if (!admin) {
    return { errors: [{ name: 'credentials', message: INVALID_CREDENTIALS_MESSAGE }] };
  }

  const valid = await password.verify(plainPassword, admin.passwordHash);
  if (!valid) {
    return { errors: [{ name: 'credentials', message: INVALID_CREDENTIALS_MESSAGE }] };
  }

  const token = jwt.sign({ type: TOKEN_TYPE.ADMIN, sub: admin.id, role: admin.role });

  return { doc: { admin, token } };
};

const me = async (adminId) => {
  const admin = await Admin.findById(adminId);
  if (!admin) {
    return { errors: [{ name: 'admin', message: 'Not authenticated.' }] };
  }

  return { doc: admin };
};

module.exports = { login, me };
