const express = require('express');

const router = express.Router();

require('./health')(router);
require('./auth')(router);
require('./notify')(router);
require('./admin')(router);
require('./customer/products')(router);
require('./customer/orders')(router);
require('./customer/payment')(router);
require('./customer/coupons')(router);
require('./webhook/razorpay')(router);
require('./webhook/cashfree')(router);
require('./webhook/payu')(router);

module.exports = router;
