const pino = require('pino');
const { NODE_ENV } = require('../config');

const logger = pino({
  level: NODE_ENV === 'test' ? 'silent' : 'info',
});

module.exports = logger;
