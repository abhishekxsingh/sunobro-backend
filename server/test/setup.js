const mongoose = require('mongoose');
const { connect } = require('../database/models');
const { MONGODB_URI } = require('../config');

// Use a separate test database to avoid clobbering development data.
const TEST_URI = MONGODB_URI.replace(/\/([^/?]+)(\?|$)/, '/sunobro_test$2');

before(async () => {
  await connect(TEST_URI);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});
