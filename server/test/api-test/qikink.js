const { expect } = require('chai');
const sinon = require('sinon');
const { Order } = require('../../database/models');
const PaymentService = require('../../services/customer/payment');
const QikinkService = require('../../services/admin/qikink');
const AdminOrdersService = require('../../services/admin/orders');
const { toOrderDTO } = require('../../utils/serializers');

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// Routes every Qikink call to an in-test handler so nothing reaches the live API.
const stubQikink = (handlers) => sinon.stub(global, 'fetch').callsFake(async (url, init = {}) => {
  const { pathname, searchParams } = new URL(url);
  if (pathname === '/api/token') {
    return jsonResponse({ ClientId: 'test', Accesstoken: 'token', expires_in: 3600 });
  }
  if (pathname === '/api/order/create') return handlers.create(JSON.parse(init.body));
  if (pathname === '/api/order/list') return handlers.list(searchParams);
  throw new Error(`unexpected Qikink call: ${pathname}`);
});

const makeOrder = (overrides = {}) => Order.create({
  reference: `SB-T${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
  status: 'pending',
  subtotal: 500,
  total: 500,
  shippingFirstName: 'Ada',
  shippingLastName: 'Lovelace',
  shippingStreet: '12 MG Road',
  shippingCity: 'Bengaluru',
  shippingPostalCode: '560001',
  shippingCountry: 'India',
  shippingPhone: '9876543210',
  items: [{
    name: 'Tee', size: 'M', color: 'Black', sku: 'QK-TEST-M', qikinkSku: 'QKSKU-M', price: 500, qty: 1,
  }],
  ...overrides,
});

describe('Qikink fulfilment', () => {
  let fetchStub;

  afterEach(async () => {
    if (fetchStub) fetchStub.restore();
    fetchStub = null;
    await Order.deleteMany({ reference: /^SB-T/ });
  });

  it('pushes a paid order once even when verify and the webhook race', async () => {
    const created = [];
    fetchStub = stubQikink({
      create: async (body) => {
        created.push(body);
        return jsonResponse({ message: 'Order created successfully', order_id: 111, status_code: '200' });
      },
      list: async () => jsonResponse({ success: true, data: [] }),
    });
    const order = await makeOrder();

    await Promise.all([
      PaymentService.markPaidAndFulfill(order, 'pay_1'),
      PaymentService.markPaidAndFulfill(order, 'pay_1'),
    ]);

    const saved = await Order.findById(order._id);
    expect(created).to.have.length(1);
    expect(created[0].line_items[0].sku).to.equal('QKSKU-M');
    expect(saved.status).to.equal('paid');
    expect(saved.qikinkOrderId).to.equal('111');
    expect(saved.qikinkStatus).to.equal('created');
    expect(saved.razorpayPaymentId).to.equal('pay_1');
  });

  it('records a failed push and lets an admin retry without creating a duplicate', async () => {
    let createCalls = 0;
    let remoteExists = false;
    fetchStub = stubQikink({
      create: async () => {
        createCalls += 1;
        // Simulate Qikink accepting the order but the response being lost.
        remoteExists = true;
        return jsonResponse({ error: 'Gateway timeout', status_code: '504' }, 504);
      },
      list: async (params) => jsonResponse({
        success: true,
        data: remoteExists && params.get('order_reference_no')
          ? [{ order_id: 222, status: 'Live', shipping: {} }]
          : [],
      }),
    });
    const order = await makeOrder();

    await PaymentService.markPaidAndFulfill(order, 'pay_2');
    let saved = await Order.findById(order._id);
    expect(saved.qikinkStatus).to.equal('error');
    expect(saved.qikinkAttempts).to.equal(1);
    expect(saved.qikinkOrderId).to.equal(undefined);

    const { doc } = await AdminOrdersService.pushToQikink(order.id);
    saved = await Order.findById(order._id);
    expect(createCalls).to.equal(1);
    expect(doc.qikinkOrderId).to.equal('222');
    expect(saved.qikinkStatus).to.equal('Live');
    expect(saved.qikinkError).to.equal(undefined);
  });

  it('refuses to push orders that are not paid or already on Qikink', async () => {
    const pending = await makeOrder();
    const pushed = await makeOrder({ status: 'paid', qikinkOrderId: '333' });

    expect((await AdminOrdersService.pushToQikink(pending.id)).type).to.equal('conflict');
    expect((await AdminOrdersService.pushToQikink(pushed.id)).type).to.equal('conflict');
  });

  it('syncs status and tracking in one batched call and honours the sync TTL', async () => {
    const listCalls = [];
    fetchStub = stubQikink({
      create: async () => { throw new Error('should not create'); },
      list: async (params) => {
        listCalls.push(params.get('ids'));
        return jsonResponse({
          success: true,
          data: [
            {
              order_id: 401,
              status: 'In-Transit',
              shipping: { awb: 'AWB1', tracking_link: 'https://track/AWB1', courier_provider_name: 'Bluedart ' },
            },
            { order_id: 402, status: 'Delivered', shipping: {} },
          ],
        });
      },
    });
    const a = await makeOrder({ status: 'paid', qikinkOrderId: '401', qikinkStatus: 'created' });
    const b = await makeOrder({ status: 'paid', qikinkOrderId: '402', qikinkStatus: 'created' });

    await QikinkService.syncOrders([a, b]);
    await QikinkService.syncOrders([a, b]);

    expect(listCalls).to.deep.equal(['401,402']);
    const [savedA, savedB] = await Promise.all([Order.findById(a._id), Order.findById(b._id)]);
    expect(savedA.status).to.equal('shipped');
    expect(savedA.qikinkAwb).to.equal('AWB1');
    expect(savedA.qikinkCourier).to.equal('Bluedart');
    expect(savedB.status).to.equal('delivered');
  });

  it('keeps RTO and other exception labels for a human to resolve', () => {
    expect(QikinkService.storeStatusFromQikink('RTO Initiated', 'shipped')).to.equal('shipped');
    expect(QikinkService.storeStatusFromQikink('Out for Delivery', 'paid')).to.equal('shipped');
    expect(QikinkService.storeStatusFromQikink('Cancelled', 'paid')).to.equal('cancelled');
  });

  it('never shows internal fulfilment errors to customers', async () => {
    const order = await makeOrder({ status: 'paid', qikinkStatus: 'error', qikinkError: 'SKU missing' });
    const dto = toOrderDTO(order);
    expect(dto.qikinkError).to.equal(null);
    expect(dto.qikinkStatus).to.equal('Processing');
  });

  it('shows shoppers friendly labels and no tracking link before a shipment exists', async () => {
    const onHold = toOrderDTO(await makeOrder({
      status: 'paid', qikinkStatus: 'On Hold', qikinkTrackingLink: 'https://courierupdates.com/?awb=',
    }));
    expect(onHold.qikinkStatus).to.equal('Processing');
    expect(onHold.trackingLink).to.equal(null);

    const outForDelivery = toOrderDTO(await makeOrder({
      status: 'shipped', qikinkStatus: 'Out for Delivery', qikinkAwb: 'AWB9', qikinkTrackingLink: 'https://t/AWB9',
    }));
    expect(outForDelivery.qikinkStatus).to.equal('Out for delivery');
    expect(outForDelivery.trackingLink).to.equal('https://t/AWB9');
  });
});
