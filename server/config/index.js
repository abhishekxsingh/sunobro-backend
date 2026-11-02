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
  STOREFRONT_URL: process.env.STOREFRONT_URL || 'http://localhost:3001',
  RAZORPAY: {
    KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_live_TPuJb9rvL5n6bY',
    KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'zYopewN0OGJoJ4G8btkUe35o',
    WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  // PayU live merchant only. Checkout posts to https://secure.payu.in/_payment.
  PAYU: {
    KEY: process.env.PAYU_MERCHANT_KEY || 'ajSnyh',
    SALT: process.env.PAYU_MERCHANT_SALT || 'Eg2chVYGRCoUUayEGxwCIgZatcXoRTQE',
    CLIENT_ID: process.env.PAYU_CLIENT_ID || '0845b77ded81c665315a098741332eb3061041a53cfdc44ce7097d9ede73e6cc',
    CLIENT_SECRET: process.env.PAYU_CLIENT_SECRET || '31b1332b49394a90cc43828cc705bf1bd824f1adecc425ed5dff5a5e4e4bec0f',
    ENV: 'production',
    CHECKOUT_URL: 'https://secure.payu.in/_payment',
    VERIFY_URL: 'https://info.payu.in/merchant/postservice.php?form=2',
  },
  // Easebuzz stays off in admin until a key and salt are set.
  // EASEBUZZ_ENV=test uses testpay.easebuzz.in.
  EASEBUZZ: {
    KEY: process.env.EASEBUZZ_MERCHANT_KEY || '',
    SALT: process.env.EASEBUZZ_MERCHANT_SALT || '',
    ENV: process.env.EASEBUZZ_ENV === 'test' ? 'test' : 'production',
    BASE_URL: process.env.EASEBUZZ_ENV === 'test'
      ? 'https://testpay.easebuzz.in'
      : 'https://pay.easebuzz.in',
    RETRIEVE_URL: process.env.EASEBUZZ_ENV === 'test'
      ? 'https://testdashboard.easebuzz.in/transaction/v2.1/retrieve'
      : 'https://dashboard.easebuzz.in/transaction/v2.1/retrieve',
  },
  // Cashfree sandbox app. Requests go to sandbox.cashfree.com unless
  // CASHFREE_ENV=production.
  CASHFREE: {
    APP_ID: process.env.CASHFREE_APP_ID || '',
    SECRET: process.env.CASHFREE_SECRET || '',
    WEBHOOK_SECRET: process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET || '',
    ENV: process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
    BASE_URL: process.env.CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg',
  },
  QIKINK: {
    // ClientId is the same for sandbox and live.
    CLIENT_ID: process.env.QIKINK_CLIENT_ID || '909927305150864',
    CLIENT_SECRET: process.env.QIKINK_CLIENT_SECRET
      || (QIKINK_ENV === 'live' ? LIVE_QIKINK_SECRET : ''),
    ENV: QIKINK_ENV,
    BASE_URL: QIKINK_ENV === 'sandbox' ? 'https://sandbox.qikink.com' : 'https://api.qikink.com',
    // Dashboard S3 asset folder id (clients/<id>/clientProducts/...), not the
    // Custom API ClientId. Used to auto-fill empty product cover images.
    ASSET_CLIENT_ID: process.env.QIKINK_ASSET_CLIENT_ID || '',
    // Background status sync + failed-push retry. 0 disables it.
    SYNC_INTERVAL_MS: Number(process.env.QIKINK_SYNC_INTERVAL_MS ?? 15 * 60 * 1000),
    // Dashboard My Products list (DataTables). Returns client_id + client_product_id
    // used for S3 mockup URLs. Custom API token is sent; many accounts also need
    // QIKINK_DASHBOARD_COOKIE from a logged-in browser session.
    FETCH_MY_PRODUCTS_URL: process.env.QIKINK_FETCH_MY_PRODUCTS_URL
      || 'https://dashboard.qikink.com/index.php/products/fetch_my_products',
    DASHBOARD_COOKIE: process.env.QIKINK_DASHBOARD_COOKIE || '',
    // Optional CSV fallback when the dashboard session is missing.
    CATALOG_EXPORT_PATH: process.env.QIKINK_CATALOG_EXPORT_PATH || '',
    CATALOG_EXPORT_URL: process.env.QIKINK_CATALOG_EXPORT_URL || '',
    // Poll interval. 10000 = 10s (dev); later use 600000–900000 (10–15 min).
    // Set 0 to disable the catalog cron.
    CATALOG_SYNC_INTERVAL_MS: Number(
      process.env.QIKINK_CATALOG_SYNC_INTERVAL_MS ?? 10_000,
    ),
    // After import, scaffold missing variants + publish so the storefront shows
    // new products (temporary v-pending-… Store SKUs until real ones are pasted).
    CATALOG_AUTO_PUBLISH: process.env.QIKINK_CATALOG_AUTO_PUBLISH !== 'false',
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
