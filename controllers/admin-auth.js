const adminAuthService = require('../services/admin-auth-service');
const { toAdminDTO } = require('../utils/serializers');
const { setSessionCookie, clearSessionCookie } = require('../utils/cookies');
const { ADMIN_SESSION_COOKIE } = require('../config');

const login = async (req, res) => {
  const { admin, token } = await adminAuthService.login(req.body);
  setSessionCookie(res, ADMIN_SESSION_COOKIE, token);
  res.json({ admin: toAdminDTO(admin) });
};

const logout = async (req, res) => {
  clearSessionCookie(res, ADMIN_SESSION_COOKIE);
  res.status(204).end();
};

const me = async (req, res) => {
  const admin = await adminAuthService.me(req.admin.sub);
  res.json(toAdminDTO(admin));
};

module.exports = { login, logout, me };
