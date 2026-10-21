const jwt = require('../jwt');
const { Admin } = require('../../database/models');
const HttpError = require('../http-error');
const { TOKEN_TYPE } = require('../constant');
const { ADMIN_SESSION_COOKIE, CUSTOMER_SESSION_COOKIE } = require('../../config');

// Sessions last 7 days, so the account is looked up on every request: a
// removed or deactivated member is signed out at once, and a role change
// applies immediately.
const requireAdmin = async (req, res, next) => {
  const token = req.cookies[ADMIN_SESSION_COOKIE];
  if (!token) return next(new HttpError(401, 'Not authenticated.'));
  let payload;
  try {
    payload = jwt.verify(token);
    if (payload.type !== TOKEN_TYPE.ADMIN) throw new Error('wrong token type');
  } catch {
    return next(new HttpError(401, 'Not authenticated.'));
  }
  try {
    const admin = await Admin.findById(payload.sub).select('role active').lean();
    if (!admin || admin.active === false) return next(new HttpError(401, 'Not authenticated.'));
    req.admin = { ...payload, role: admin.role };
    return next();
  } catch (err) {
    return next(err);
  }
};

/** Only members with one of these roles (after requireAdmin). */
const requireRole = (...roles) => (req, res, next) => (
  roles.includes(req.admin?.role) ? next() : next(new HttpError(403, 'Not allowed.'))
);

const requireCustomer = (req, res, next) => {
  const token = req.cookies[CUSTOMER_SESSION_COOKIE];
  if (!token) return next(new HttpError(401, 'Not authenticated.'));
  try {
    const payload = jwt.verify(token);
    if (payload.type !== TOKEN_TYPE.CUSTOMER) throw new Error('wrong token type');
    req.customer = payload;
    return next();
  } catch {
    return next(new HttpError(401, 'Not authenticated.'));
  }
};

const attachCustomerIfPresent = (req, res, next) => {
  const token = req.cookies[CUSTOMER_SESSION_COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token);
    if (payload.type === TOKEN_TYPE.CUSTOMER) req.customer = payload;
  } catch {
    // guest request with an invalid/expired cookie — proceed unauthenticated
  }
  return next();
};

module.exports = {
  requireAdmin, requireRole, requireCustomer, attachCustomerIfPresent,
};
