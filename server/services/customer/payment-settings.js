const { Setting } = require('../../database/models');
const { RAZORPAY, PAYU, CASHFREE } = require('../../config');

const GATEWAYS = ['payu', 'razorpay', 'cashfree'];

const isDummy = (value) => !value || String(value).toLowerCase().startsWith('dummy');

const describe = () => ([
  {
    id: 'payu',
    label: 'PayU',
    mode: PAYU.ENV,
    configured: Boolean(PAYU.KEY && PAYU.SALT),
    dummy: isDummy(PAYU.KEY) || isDummy(PAYU.SALT),
  },
  {
    id: 'razorpay',
    label: 'Razorpay',
    mode: String(RAZORPAY.KEY_ID || '').startsWith('rzp_test') ? 'test' : 'live',
    configured: Boolean(RAZORPAY.KEY_ID && RAZORPAY.KEY_SECRET),
    dummy: isDummy(RAZORPAY.KEY_ID) || isDummy(RAZORPAY.KEY_SECRET),
  },
  {
    id: 'cashfree',
    label: 'Cashfree',
    mode: CASHFREE.ENV,
    configured: Boolean(CASHFREE.APP_ID && CASHFREE.SECRET),
    dummy: isDummy(CASHFREE.APP_ID) || isDummy(CASHFREE.SECRET),
  },
]);

const getActive = async () => {
  const doc = await Setting.findOne({ key: 'payments' }).lean();
  return GATEWAYS.includes(doc?.activeGateway) ? doc.activeGateway : 'payu';
};

const snapshot = async () => ({
  activeGateway: await getActive(),
  gateways: describe(),
});

const setActive = async (activeGateway) => {
  if (!GATEWAYS.includes(activeGateway)) {
    return { errors: [{ name: 'activeGateway', message: 'Choose Razorpay, PayU, or Cashfree.' }] };
  }
  const gateway = describe().find((item) => item.id === activeGateway);
  if (!gateway.configured) {
    return {
      type: 'not-configured',
      errors: [{ name: activeGateway, message: `${gateway.label} keys are not configured on the server.` }],
    };
  }
  await Setting.findOneAndUpdate(
    { key: 'payments' },
    { $set: { activeGateway } },
    { upsert: true },
  );
  return { doc: await snapshot() };
};

const publicActive = async () => {
  const activeGateway = await getActive();
  const gateway = describe().find((item) => item.id === activeGateway);
  return { gateway: activeGateway, label: gateway.label };
};

module.exports = {
  getActive, snapshot, setActive, publicActive, GATEWAYS,
};
