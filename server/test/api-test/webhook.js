const crypto = require('crypto');
const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const app = require('../../server');
const { Order } = require('../../database/models');
const { RAZORPAY } = require('../../config');

chai.use(chaiHttp);
const { expect } = chai;

const SECRET = RAZORPAY.WEBHOOK_SECRET || RAZORPAY.KEY_SECRET;
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex');

const capturedEvent = (razorpayOrderId, amount = 50000, currency = 'INR') => JSON.stringify({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_TEST', order_id: razorpayOrderId, amount, currency,
      },
    },
  },
});

const post = (body, signature) => {
  const req = chai.request(app).post('/webhook/razorpay').set('content-type', 'application/json');
  if (signature) req.set('x-razorpay-signature', signature);
  return req.send(body);
};

describe('POST /webhook/razorpay', () => {
  let order;
  let fetchStub;

  beforeEach(async () => {
    // Paid orders push to Qikink — never let that reach the real API.
    fetchStub = sinon.stub(global, 'fetch').callsFake(async (url) => {
      const json = (body) => ({ ok: true, status: 200, json: async () => body });
      if (new URL(url).pathname === '/api/token') return json({ Accesstoken: 't', expires_in: 3600 });
      return json({ order_id: 777, status_code: '200' });
    });
    order = await Order.create({
      reference: `SB-W${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      status: 'pending',
      subtotal: 500,
      total: 500,
      razorpayOrderId: `order_${Date.now()}`,
      shippingFirstName: 'Ada',
      shippingLastName: 'Lovelace',
      shippingStreet: '12 MG Road',
      shippingCity: 'Bengaluru',
      shippingPostalCode: '560001',
      shippingCountry: 'India',
      items: [{
        name: 'Tee', size: 'M', color: 'Black', sku: 'WH-TEE-M', qikinkSku: 'QK-M', price: 500, qty: 1,
      }],
    });
  });

  afterEach(async () => {
    fetchStub.restore();
    await Order.findByIdAndDelete(order._id);
  });

  it('rejects an unsigned event and leaves the order unpaid', async () => {
    const res = await post(capturedEvent(order.razorpayOrderId));
    expect(res).to.have.status(401);
    expect((await Order.findById(order._id)).status).to.equal('pending');
  });

  it('rejects a forged signature', async () => {
    const res = await post(capturedEvent(order.razorpayOrderId), sign('something else'));
    expect(res).to.have.status(401);
    expect((await Order.findById(order._id)).status).to.equal('pending');
  });

  it('verifies the signature over the raw body bytes', async () => {
    // Extra whitespace changes the bytes but not the parsed JSON — the
    // signature must still match what Razorpay actually sent.
    const body = capturedEvent(order.razorpayOrderId).replace('{', '{ ');
    const res = await post(body, sign(body));
    expect(res).to.have.status(200);
    expect((await Order.findById(order._id)).status).to.equal('paid');
  });

  it('ignores a signed capture whose amount does not match the order', async () => {
    const body = capturedEvent(order.razorpayOrderId, 100);
    const res = await post(body, sign(body));
    expect(res).to.have.status(200);
    expect((await Order.findById(order._id)).status).to.equal('pending');
  });
});
