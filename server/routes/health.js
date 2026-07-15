const { ping } = require('../controllers/health');

module.exports = (router) => {
  router.get('/ping', ping);
};
