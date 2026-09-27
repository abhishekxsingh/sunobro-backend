require('dotenv').config();
const { version, name } = require('../package.json');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Add it to .env before starting the server.');
}

module.exports = {
  VERSION: version,
  NAME: name,
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  DOMAIN: process.env.DOMAIN || 'http://localhost:3000',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/sunobro',
  JWT_SECRET: process.env.JWT_SECRET,
  ADMIN_SESSION_COOKIE: process.env.ADMIN_SESSION_COOKIE || 'sb_admin_session',
  CUSTOMER_SESSION_COOKIE: process.env.CUSTOMER_SESSION_COOKIE || 'sb_session',
  RAZORPAY: {
    KEY_ID: process.env.RAZORPAY_KEY_ID || '',
    KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
    WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  QIKINK: {
    CLIENT_ID: process.env.QIKINK_CLIENT_ID || '',
    CLIENT_SECRET: process.env.QIKINK_CLIENT_SECRET || '',
    ENV: process.env.QIKINK_ENV || 'sandbox',
  },
};
