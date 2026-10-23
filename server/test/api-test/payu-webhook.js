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
    fetchStub = sinon.stub(global, 'fetch').callsFake(async (url, options = {}) => {
      const target = String(url);
      if (target.includes('postservice')) {
        const params = new URLSearchParams(options.body);
        const command = params.get('command');
        const var1 = params.get('var1');
        const details = command === 'check_action_status'
          ? {
            [var1]: {
              status: 'success', action: 'refund', amt: '500.00', request_id: var1,
            },
          }
          : { [txnid]: { status: 'success', mihpayid: '403993715527188675', amt: '500.00' } };
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 1, transaction_details: details }),
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
    body.error_Message = 'Bank denied transaction on the card.';
    body.hash = Payu.responseHash(body, PAYU.SALT);
    const res = await post(body);
    expect(res).to.have.status(200);
    const saved = await Order.findById(order._id);
    expect(saved.status).to.equal('pending');
    expect(saved.statusHistory.some((entry) => /PayU payment failed/.test(entry.note))).to.equal(true);
    expect(mailStub.called).to.equal(false);
  });

  it('cancels a paid order when PayU confirms a full refund', async () => {
    order.status = 'paid';
    order.payuPaymentId = '403993715527188675';
    await order.save();
    const statusMail = sinon.stub(emailService, 'sendOrderStatus').resolves();
    const res = await chai.request(app).post('/webhook/payu').send({
      action: 'refund',
      key: PAYU.KEY,
      status: 'success',
      amt: '500.00',
      request_id: '17265314530',
      merchantTxnId: txnid,
      mihpayid: '403993715527188675',
    });
    statusMail.restore();
    expect(res).to.have.status(200);
    const saved = await Order.findById(order._id);
    expect(saved.status).to.equal('cancelled');
    expect(saved.payuRefundStatus).to.equal('success');
    expect(statusMail.calledOnce).to.equal(true);
  });

  it('rejects a refund for a different merchant key', async () => {
    order.status = 'paid';
    await order.save();
    const res = await chai.request(app).post('/webhook/payu').send({
      action: 'refund',
      key: 'not-our-key',
      status: 'success',
      amt: '500.00',
      request_id: '17265314530',
      merchantTxnId: txnid,
    });
    expect(res).to.have.status(401);
    expect((await Order.findById(order._id)).status).to.equal('paid');
  });

  it('records a dispute and cancels when it closes in the customer favour', async () => {
    order.status = 'paid';
    order.payuPaymentId = '403993715527188675';
    await order.save();
    const opened = await chai.request(app).post('/webhook/payu').send({
      type: 'payments',
      event: 'dispute',
      cb_id: 1761758,
      txn_id: '403993715527188675',
      cb_status: 'New',
      cb_amount: '500.0',
      reason_code: 'Fraud - Card Present Environment',
    });
    expect(opened).to.have.status(200);
    expect((await Order.findById(order._id)).status).to.equal('paid');

    const statusMail = sinon.stub(emailService, 'sendOrderStatus').resolves();
    const closed = await chai.request(app).post('/webhook/payu').send({
      event: 'dispute',
      cb_id: 1761758,
      txn_id: '403993715527188675',
      cb_status: 'Closed Customer Favour',
      cb_amount: '500.0',
      reason_code: 'Fraud - Card Present Environment',
    });
    statusMail.restore();
    expect(closed).to.have.status(200);
    const saved = await Order.findById(order._id);
    expect(saved.status).to.equal('cancelled');
    expect(saved.payuDisputeStatus).to.equal('Closed Customer Favour');
    expect(statusMail.calledOnce).to.equal(true);
  });
});
