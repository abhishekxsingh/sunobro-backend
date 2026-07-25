const AdminProfileService = require('../../services/admin/profile');

const update = async (req, res) => {
  try {
    const { body, admin } = req;
    const { name, email } = body;
    if (!name || !email) return res.badRequest('field-validation', [{ message: 'name and email are required.' }]);

    const { doc, errors } = await AdminProfileService.update(admin.sub, { name, email });
    if (errors) return res.badRequest('field-validation', errors);

    return res.getRequest({ id: doc.id, name: doc.name, email: doc.email, role: doc.role });
  } catch (error) {
    return res.serverError(error);
  }
};

const changePassword = async (req, res) => {
  try {
    const { body, admin } = req;
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return res.badRequest('field-validation', [{ message: 'currentPassword and newPassword are required.' }]);
    }
    if (newPassword.length < 8) {
      return res.badRequest('field-validation', [{ message: 'newPassword must be at least 8 characters.' }]);
    }

    const { errors } = await AdminProfileService.changePassword(admin.sub, { currentPassword, newPassword });
    if (errors) return res.badRequest('field-validation', errors);

    return res.getRequest(null);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { update, changePassword };
