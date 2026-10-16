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
    KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_live_TPuJb9rvL5n6bY',
    KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'zYopewN0OGJoJ4G8btkUe35o',
    WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  QIKINK: {
    CLIENT_ID: '909927305150864',
    CLIENT_SECRET: 'b20cf47796d977fe0ffc2b9249625c94705dd15522ee617df91a395304bcb25e',
    ENV: 'live',
  },
  FIREBASE: {
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'sunobro',
    CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
    PRIVATE_KEY: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
    API_KEY: process.env.FIREBASE_API_KEY || '',
    AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || '',
    STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || '',
    MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    APP_ID: process.env.FIREBASE_APP_ID || '',
    MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID || '',
  },
};
