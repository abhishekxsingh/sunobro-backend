const { VERSION, NAME } = require('../config');

const ping = (req, res) => {
  res.json({ status: 'ok', version: VERSION, name: NAME });
};

module.exports = { ping };
