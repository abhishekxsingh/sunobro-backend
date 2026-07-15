const logger = require('../logger');

const jsonError = (req, type, details) => ({
  type,
  correlationId: req.correlationId,
  details,
});

module.exports = (req, res, next) => {
  res.getRequest = (doc) => res.status(200).json(doc);

  res.getSuccessfully = (json) => res.status(200).json(json);

  res.postRequest = () => res.status(201).end();

  res.postSuccessfully = (json) => res.status(201).json(json);

  res.updated = () => res.status(204).end();

  res.patch = () => res.status(204).end();

  res.deleted = () => res.status(204).end();

  res.badRequest = (type, details) => res.status(400).json(jsonError(req, type, details));

  res.unAuthorized = () => res.status(401).end();

  res.forbidden = () => res.status(403).end();

  res.notFound = () => res.status(404).end();

  res.conflict = (type, details) => res.status(409).json(jsonError(req, type, details));

  res.concurrencyError = () => res.status(412).end();

  res.notImplemented = () => res.status(501).json(jsonError(req, 'not-implemented', [{ message: 'Not implemented.' }]));

  res.serverError = (error) => {
    logger.error({ err: error, correlationId: req.correlationId }, 'unhandled-error');

    return res.status(500).json(jsonError(req, 'server-error', [{ message: 'Internal server error.' }]));
  };

  return next();
};
