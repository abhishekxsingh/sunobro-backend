const AdminAuthService = require('../../services/admin/auth');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');
const { toAdminDTO } = require('../../utils/serializers');
const { setSessionCookie, clearSessionCookie } = require('../../utils/cookies');
const { ADMIN_SESSION_COOKIE } = require('../../config');

const login = async (req, res) => {
  try {
    const { body } = req;
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: body,
      schema: Schemas.admin.auth.login,
    });

    if (validationErrors) {
      return res.badRequest('field-validation', validationErrors);
    }

    const { doc } = await AdminAuthService.login(body);

    if (!doc) {
      return res.unAuthorized();
    }

    setSessionCookie(res, ADMIN_SESSION_COOKIE, doc.token);

    return res.getSuccessfully({ admin: toAdminDTO(doc.admin) });
  } catch (error) {
    return res.serverError(error);
  }
};

const logout = async (req, res) => {
  try {
    clearSessionCookie(res, ADMIN_SESSION_COOKIE);

    return res.deleted();
  } catch (error) {
    return res.serverError(error);
  }
};

const me = async (req, res) => {
  try {
    const { admin: { sub: adminId } } = req;
    const { doc } = await AdminAuthService.me(adminId);

    if (!doc) {
      return res.unAuthorized();
    }

    return res.getRequest(toAdminDTO(doc));
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { login, logout, me };
