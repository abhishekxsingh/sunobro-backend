const jwt = require('../jwt');
const HttpError = require('../http-error');
const { TOKEN_TYPE } = require('../constant');
const { ADMIN_SESSION_COOKIE, CUSTOMER_SESSION_COOKIE } = require('../../config');

const requireAdmin = (req, res, next) => {
  const token = req.cookies[ADMIN_SESSION_COOKIE];
  if (!token) return next(new HttpError(401, 'Not authenticated.'));
  try {
    const payload = jwt.verify(token);
    if (payload.type !== TOKEN_TYPE.ADMIN) throw new Error('wrong token type');
    req.admin = payload;
    return next();
  } catch {
    return next(new HttpError(401, 'Not authenticated.'));
  }
};

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

module.exports = { requireAdmin, requireCustomer, attachCustomerIfPresent };
