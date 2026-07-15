const { v4: uuidv4 } = require('uuid');

const HEADER = 'x-correlation-id';

module.exports = (req, res, next) => {
  const correlationId = req.headers[HEADER] || uuidv4();
  req.correlationId = correlationId;
  res.set(HEADER, correlationId);
  next();
};
