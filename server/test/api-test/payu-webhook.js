const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const app = require('../../server');
const { Order } = require('../../database/models');
const { PAYU } = require('../../config');
const Payu = require('../../services/customer/payu');
const emailService = require('../../services/email');

chai.use(chaiHttp);
const { expect } = chai;

const successBody = (order, txnid) => {
  const body = {
    key: PAYU.KEY,
    txnid,
    amount: '500.00',
    productinfo: 'SunoBro',
    firstname: 'Ada',
    email: 'payu-webhook@orders.test',
    udf1: order.id,
    status: 'success',
    mihpayid: '403993715527188675',
  };
  body.hash = Payu.responseHash(body, PAYU.SALT);
  return body;
};

describe('POST /webhook/payu', () => {
  let order;
  let fetchStub;
  let mailStub;
  const txnid = `SB${Date.now().toString(16)}`.slice(0, 25);

  beforeEach(async () => {
    mailStub = sinon.stub(emailService, 'sendOrderConfirmation').resolves();
    fetchStub = sinon.stub(global, 'fetch').callsFake(async (url) => {
      const target = String(url);
      if (target.includes('postservice')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status: 1,
            transaction_details: {
              [txnid]: { status: 'success', mihpayid: '403993715527188675', amt: '500.00' },
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          Accesstoken: 't',
          expires_in: 3600,
          order_id: 777,
          status_code: '200',
        }),
        text: async () => '{}',
      };
    });
    order = await Order.create({
      reference: `SB-P${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      status: 'pending',
      subtotal: 500,
      total: 500,
      paymentGateway: 'payu',
      payuTxnId: txnid,
      shippingEmail: 'payu-webhook@orders.test',
      shippingFirstName: 'Ada',
      shippingLastName: 'Lovelace',
      shippingStreet: '12 MG Road',
      shippingCity: 'Bengaluru',
      shippingPostalCode: '560001',
      shippingCountry: 'India',
      items: [{
        name: 'Tee',
        size: 'M',
        color: 'Black',
        sku: 'PU-TEE-M',
        qikinkSku: 'QK-M',
        price: 500,
        qty: 1,
      }],
    });
  });

  afterEach(async () => {
    fetchStub.restore();
    mailStub.restore();
    await Order.findByIdAndDelete(order._id);
  });

  const post = (body) => chai.request(app).post('/webhook/payu').type('form').send(body);

  it('rejects a bad hash and leaves the order unpaid', async () => {
    const body = successBody(order, txnid);
    body.hash = 'a'.repeat(128);
    const res = await post(body);
    expect(res).to.have.status(401);
    expect((await Order.findById(order._id)).status).to.equal('pending');
    expect(mailStub.called).to.equal(false);
  });

  it('marks the order paid and sends the confirmation mail on a verified success', async () => {
    const res = await post(successBody(order, txnid));
    expect(res).to.have.status(200);
    const saved = await Order.findById(order._id);
    expect(saved.status).to.equal('paid');
    expect(saved.payuPaymentId).to.equal('403993715527188675');
    expect(mailStub.calledOnce).to.equal(true);
  });

  it('accepts a failed payment without confirming the order', async () => {
    const body = successBody(order, txnid);
    body.status = 'failure';
    body.hash = Payu.responseHash(body, PAYU.SALT);
    const res = await post(body);
    expect(res).to.have.status(200);
    expect((await Order.findById(order._id)).status).to.equal('pending');
    expect(mailStub.called).to.equal(false);
  });
});
