const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../server');
const { Product, ProductVariant } = require('../../database/models');

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

  before(async () => {
    product = await Product.create({
      slug: 'orders-test-tee',
      name: 'Orders Test Tee',
      description: 'A tee used only in tests.',
      price: 100,
      currency: 'INR',
      images: [],
      sizes: ['M'],
    });
    variant = await ProductVariant.create({
      productId: product.id,
      size: 'M',
      color: 'Black',
      sku: 'ORDERS-TEST-TEE-M-BLACK',
      stock: 5,
    });
  });

  after(async () => {
    await ProductVariant.destroy({ where: { id: variant.id } });
    await Product.destroy({ where: { id: product.id } });
  });

  it('recomputes totals server-side instead of trusting client-submitted amounts', async () => {
    const res = await chai.request(app)
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
    await chai.request(app)
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

    await variant.reload();
    expect(variant.stock).to.equal(2); // 5 - 2 (first test) - 1 (this test)
  });

  it('rejects an order for insufficient stock with 409', async () => {
    const res = await chai.request(app)
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
    const res = await chai.request(app).post('/orders').send({ items: [] });
    expect(res.status).to.equal(400);
  });
});
