const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const hash = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

const verify = (plain, passwordHash) => bcrypt.compare(plain, passwordHash);

module.exports = { hash, verify };
