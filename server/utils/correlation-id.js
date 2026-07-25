const { randomUUID } = require('crypto');

const HEADER = 'x-correlation-id';

module.exports = (req, res, next) => {
  const correlationId = req.headers[HEADER] || randomUUID();
  req.correlationId = correlationId;
  res.set(HEADER, correlationId);
  next();
};
