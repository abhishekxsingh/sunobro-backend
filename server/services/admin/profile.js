const { Admin } = require('../../database/models');
const password = require('../../utils/password');

const update = async (adminId, { name, email }) => {
  try {
    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { $set: { name, email } },
      { new: true, runValidators: true },
    );
    if (!admin) return { errors: [{ name: 'admin', message: 'Admin not found.' }] };
    return { doc: admin };
  } catch (err) {
    if (err.code === 11000) {
      return { errors: [{ name: 'email', message: 'Email already in use.' }] };
    }
    throw err;
  }
};

const changePassword = async (adminId, { currentPassword, newPassword }) => {
  const admin = await Admin.findById(adminId);
  if (!admin) return { errors: [{ name: 'admin', message: 'Admin not found.' }] };

  const valid = await password.verify(currentPassword, admin.passwordHash);
  if (!valid) return { errors: [{ name: 'currentPassword', message: 'Current password is incorrect.' }] };

  admin.passwordHash = await password.hash(newPassword);
  await admin.save();
  return { doc: null };
};

module.exports = { update, changePassword };
