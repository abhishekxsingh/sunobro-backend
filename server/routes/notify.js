const NotifyController = require('../controllers/notify');

module.exports = (router) => {
  router.post('/notify', NotifyController.subscribe);
};
