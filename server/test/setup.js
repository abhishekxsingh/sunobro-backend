const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config');

// Always a dedicated database, chosen with `dbName` rather than by rewriting
// the URI: a URI with no database path (".../?retryWrites=...") used to make
// the rewrite a no-op, so the suite ran against — and dropped — the real one.
const TEST_DB = 'sunobro_test';

const assertTestDatabase = () => {
  const name = mongoose.connection.db?.databaseName;
  if (name !== TEST_DB) {
    throw new Error(`Refusing to run tests against database "${name}" — expected "${TEST_DB}".`);
  }
};

// Atlas can take a few seconds to connect from some networks.
before(async function connectTestDatabase() {
  this.timeout(30000);
  await mongoose.connect(MONGODB_URI, { dbName: TEST_DB });
  assertTestDatabase();
});

after(async function dropTestDatabase() {
  this.timeout(30000);
  assertTestDatabase();
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});
