const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

const EXPIRES_IN = '7d';

const sign = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });

const verify = (token) => jwt.verify(token, JWT_SECRET);

module.exports = { sign, verify, EXPIRES_IN };
