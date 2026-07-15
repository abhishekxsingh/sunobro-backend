const express = require('express');

const router = express.Router();

require('./health')(router);
require('./admin')(router);
require('./auth')(router);
require('./products')(router);
require('./orders')(router);
require('./payments')(router);

module.exports = router;
