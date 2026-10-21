const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const app = require('../../server');
const {
  Customer, Order, Product, ProductVariant,
} = require('../../database/models');
const password = require('../../utils/password');
const emailService = require('../../services/email');

chai.use(chaiHttp);
const { expect } = chai;

const SHIPPING = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  street: '1 Analytical Engine Way',
  city: 'London',
  postalCode: 'EC1A 1BB',
  country: 'UK',
};

describe('Orders', () => {
  let product;
  let variant;
  let agent;
  const EMAIL = 'orders-shopper@orders.test';

  before(async () => {
    sinon.stub(emailService, 'sendOrderConfirmation').resolves();
    await Customer.deleteMany({ email: EMAIL });
    await Customer.create({ name: 'Ada Shopper', email: EMAIL, passwordHash: await password.hash('shopper-pass-123') });
    agent = chai.request.agent(app);
    await agent.post('/auth/login').send({ email: EMAIL, password: 'shopper-pass-123' });
    product = await Product.create({
      slug: 'orders-test-tee',
      name: 'Orders Test Tee',
      description: 'A tee used only in tests.',
      price: 100,
      currency: 'INR',
      images: [],
      sizes: ['M'],
      status: 'active',
      // These tests cover stock enforcement, which only applies when tracked.
      trackInventory: true,
    });
    variant = await ProductVariant.create({
      productId: product._id,
      size: 'M',
      color: 'Black',
      sku: 'ORDERS-TEST-TEE-M-BLACK',
      stock: 5,
    });
  });

  after(async () => {
    agent.close();
    emailService.sendOrderConfirmation.restore();
    await Order.deleteMany({ shippingEmail: EMAIL });
    await Customer.deleteMany({ email: EMAIL });
    await ProductVariant.findByIdAndDelete(variant._id);
    await Product.findByIdAndDelete(product._id);
  });

  it('recomputes totals server-side instead of trusting client-submitted amounts', async () => {
    const res = await agent
      .post('/orders')
      .send({
        items: [{
          productId: product.id, name: 'Wrong Name', size: 'M', color: 'Black', sku: variant.sku, price: 1, qty: 2,
        }],
        shipping: SHIPPING,
        // Client claims a total of 2 — the server must ignore this and use
        // the real product price (100 * 2 = 200) instead.
        subtotal: 2,
        tax: 0,
        shippingFee: 0,
        total: 2,
      });

    expect(res.status).to.equal(201);
    expect(res.body.total).to.equal(200);
    expect(res.body.status).to.equal('pending');
    expect(res.body.reference).to.match(/^SB-/);
  });

  it('decrements variant stock after order creation', async () => {
    await agent
      .post('/orders')
      .send({
        items: [{
          productId: product.id, name: variant.sku, size: 'M', color: 'Black', sku: variant.sku, price: 100, qty: 1,
        }],
        shipping: SHIPPING,
        subtotal: 100,
        tax: 0,
        shippingFee: 0,
        total: 100,
      });

    const refreshed = await ProductVariant.findById(variant._id);
    expect(refreshed.stock).to.equal(2); // 5 - 2 (first test) - 1 (this test)
  });

  it('rejects an order for insufficient stock with 409', async () => {
    const res = await agent
      .post('/orders')
      .send({
        items: [{
          productId: product.id, name: variant.sku, size: 'M', color: 'Black', sku: variant.sku, price: 100, qty: 999,
        }],
        shipping: SHIPPING,
        subtotal: 0,
        tax: 0,
        shippingFee: 0,
        total: 0,
      });

    expect(res.status).to.equal(409);
  });

  it('rejects a malformed payload with 400', async () => {
    const res = await agent.post('/orders').send({ items: [] });
    expect(res.status).to.equal(400);
  });

  it('refuses guest checkout — an account (email or Google) is required', async () => {
    const res = await chai.request(app).post('/orders').send({
      items: [{ sku: variant.sku, qty: 1 }], shipping: SHIPPING,
    });
    expect(res.status).to.equal(401);
  });

  it('uses the account email and keeps the checkout phone on a profile that had none', async () => {
    const res = await agent.post('/orders').send({
      items: [{ sku: variant.sku, qty: 1 }],
      shipping: { ...SHIPPING, email: 'someone-else@orders.test', phone: '9876500000' },
    });
    expect(res.status).to.equal(201);
    expect(res.body.shipping.email).to.equal(EMAIL);
    expect((await Customer.findOne({ email: EMAIL })).phone).to.equal('9876500000');

    // An existing phone is never overwritten by a later checkout.
    await agent.post('/orders').send({ items: [{ sku: variant.sku, qty: 1 }], shipping: { ...SHIPPING, phone: '9000000000' } });
    expect((await Customer.findOne({ email: EMAIL })).phone).to.equal('9876500000');
  });
});
