const { NODE_ENV } = require('../config');

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const setSessionCookie = (res, name, token) => {
  res.cookie(name, token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
  });
};

const clearSessionCookie = (res, name) => {
  res.clearCookie(name, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
  });
};

module.exports = { setSessionCookie, clearSessionCookie };
