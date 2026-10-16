require('dotenv').config();
const { version, name } = require('../package.json');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Add it to .env before starting the server.');
}

// Sandbox is opt-in via QIKINK_ENV=sandbox and never used in production, so a
// stray app setting cannot route real orders to the test account. The sandbox
// secret must come from QIKINK_CLIENT_SECRET in .env.
const QIKINK_ENV = process.env.QIKINK_ENV === 'sandbox' && process.env.NODE_ENV !== 'production'
  ? 'sandbox'
  : 'live';
const LIVE_QIKINK_SECRET = 'b20cf47796d977fe0ffc2b9249625c94705dd15522ee617df91a395304bcb25e';

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
    // ClientId is the same for sandbox and live.
    CLIENT_ID: process.env.QIKINK_CLIENT_ID || '909927305150864',
    CLIENT_SECRET: process.env.QIKINK_CLIENT_SECRET
      || (QIKINK_ENV === 'live' ? LIVE_QIKINK_SECRET : ''),
    ENV: QIKINK_ENV,
    BASE_URL: QIKINK_ENV === 'sandbox' ? 'https://sandbox.qikink.com' : 'https://api.qikink.com',
    // Background status sync + failed-push retry. 0 disables it.
    SYNC_INTERVAL_MS: Number(process.env.QIKINK_SYNC_INTERVAL_MS ?? 15 * 60 * 1000),
  },
};
