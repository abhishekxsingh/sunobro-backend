// TODO: Wire up Qikink print-on-demand API.
// Required env vars: QIKINK_CLIENT_ID, QIKINK_CLIENT_SECRET
// Docs: https://qikink.com/api (obtain from Qikink dashboard)
//
// When implemented, this service should:
//   1. Exchange QIKINK_CLIENT_ID + QIKINK_CLIENT_SECRET for an access token
//   2. POST to Qikink catalog endpoint with product name + variant SKUs
//   3. Store returned qikinkSku on each ProductVariant document
//
// Until then, all sync attempts return a not-implemented response.

const getStatus = async () => ({
  connected: false,
  message: 'Qikink not wired yet. See services/admin/qikink.js for setup instructions.',
});

const syncProduct = async () => ({
  synced: 0,
  message: 'Qikink sync not wired yet. Configure QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET.',
});

const syncAll = async () => ({
  synced: 0,
  message: 'Qikink sync not wired yet. Configure QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET.',
});

module.exports = { getStatus, syncProduct, syncAll };
