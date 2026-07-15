const { VERSION, NAME } = require('../config');

const ping = (req, res) => {
  try {
    return res.getRequest({ status: 'ok', version: VERSION, name: NAME });
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { ping };
