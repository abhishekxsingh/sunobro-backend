require('dotenv').config();
const { version, name } = require('../package.json');

module.exports = {
  VERSION: version,
  NAME: name,
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  DOMAIN: process.env.DOMAIN || 'http://localhost:3000',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  JWT_SECRET: process.env.JWT_SECRET,
  ADMIN_SESSION_COOKIE: process.env.ADMIN_SESSION_COOKIE || 'sb_admin_session',
  CUSTOMER_SESSION_COOKIE: process.env.CUSTOMER_SESSION_COOKIE || 'sb_session',
  CASHFREE: {
    APP_ID: process.env.CASHFREE_APP_ID || '',
    SECRET_KEY: process.env.CASHFREE_SECRET_KEY || '',
    ENV: process.env.CASHFREE_ENV || 'sandbox',
  },
  QIKINK: {
    CLIENT_ID: process.env.QIKINK_CLIENT_ID || '',
    CLIENT_SECRET: process.env.QIKINK_CLIENT_SECRET || '',
    ENV: process.env.QIKINK_ENV || 'sandbox',
  },
};
