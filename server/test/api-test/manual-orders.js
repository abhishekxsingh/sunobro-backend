const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const app = require('../../server');
const {
  Admin, Coupon, Customer, Order, Product, ProductVariant,
} = require('../../database/models');
const password = require('../../utils/password');
const AdminProductsService = require('../../services/admin/products');
const AdminCouponsService = require('../../services/admin/coupons');
const QikinkService = require('../../services/admin/qikink');
const emailService = require('../../services/email');

chai.use(chaiHttp);
const { expect } = chai;

const SHIP = {
  firstName: 'Meera',
  lastName: 'Joshi',
  street: '4 Lake Road',
  city: 'Pune',
  postalCode: '411001',
  country: 'India',
  phone: '9822012345',
};

describe('Admin manual orders', function manualOrders() {
  this.timeout(20000);
  let agent;
  let skus;
  let meera;
  const stubs = [];

  before(async () => {
    stubs.push(
      sinon.stub(QikinkService, 'fulfillOrder').resolves({ order: null }),
      sinon.stub(emailService, 'sendOrderConfirmation').resolves(),
    );
    await Admin.deleteMany({ email: 'mo-admin@manual.test' });
    await Admin.create({
      name: 'Ops', email: 'mo-admin@manual.test', role: 'ops', passwordHash: await password.hash('admin-pass-1234'),
    });
    agent = chai.request.agent(app);
    await agent.post('/admin/auth/login').send({ email: 'mo-admin@manual.test', password: 'admin-pass-1234' });

    await AdminProductsService.create({
      name: 'Manual Tee',
      slug: 'manual-order-tee',
      price: 700,
      // In review: admin orders may sell it; the unmapped White option keeps it off the site.
      status: 'review',
      images: ['https://img.test/m.jpg'],
      variants: [
        { size: 'M', color: 'Black', qikinkSku: 'v-mo-bm' },
        { size: 'L', color: 'Black', qikinkSku: 'v-mo-bl' },
        { size: 'M', color: 'White' },
      ],
    });
    const product = await Product.findOne({ slug: 'manual-order-tee' });
    const vs = await ProductVariant.find({ productId: product._id });
    skus = Object.fromEntries(vs.map((v) => [`${v.color}-${v.size}`, v.sku]));
    await ProductVariant.updateOne({ sku: skus['White-M'] }, { $set: { enabled: false } });

    await Customer.deleteMany({ email: /@manual\.test$/ });
    meera = await Customer.create({ name: 'Meera Joshi', email: 'meera@manual.test', phone: '9822012345' });
    await AdminCouponsService.save(null, {
      code: 'MO10', discountType: 'percent', value: 10, kind: 'festival',
    });
    await AdminCouponsService.save(null, {
      code: 'MEERA150', discountType: 'flat', value: 150, kind: 'customer', customerIds: [meera.id],
    });
    await AdminCouponsService.save(null, {
      code: 'BIG2000', discountType: 'flat', value: 300, minOrderValue: 2000,
    });
  });

  after(async () => {
    stubs.forEach((s) => s.restore());
    agent.close();
    const product = await Product.findOne({ slug: 'manual-order-tee' });
    await ProductVariant.deleteMany({ productId: product._id });
    await Product.deleteOne({ _id: product._id });
    await Order.deleteMany({ shippingFirstName: 'Meera' });
    await Customer.deleteMany({ email: /@manual\.test$/ });
    await Coupon.deleteMany({ code: { $in: ['MO10', 'MEERA150', 'BIG2000'] } });
    await Admin.deleteMany({ email: 'mo-admin@manual.test' });
  });

  it('lists sellable products and options for the picker, without switched-off ones', async () => {
    const res = await agent.get('/admin/orders/catalog');
    expect(res.status).to.equal(200);
    const tee = res.body.find((p) => p.name === 'Manual Tee');
    expect(tee.variants.map((v) => `${v.color}-${v.size}`)).to.have.members(['Black-M', 'Black-L']);
    expect(tee.variants.every((v) => v.mapped)).to.equal(true);
  });

  it('prices the cart and suggests every coupon with its saving or reason', async () => {
    const res = await agent.post('/admin/orders/quote').send({
      items: [{ sku: skus['Black-M'], qty: 2 }], customerId: meera.id, couponCode: 'meera150',
    });
    expect(res.status).to.equal(200);
    expect(res.body).to.include({ subtotal: 1400, discount: 150, total: 1250 });
    expect(res.body.coupon.code).to.equal('MEERA150');
    const offers = Object.fromEntries(res.body.offers.map((o) => [o.code, o]));
    expect(offers.MEERA150).to.include({ eligible: true, saving: 150 });
    expect(offers.MO10).to.include({ eligible: true, saving: 140 });
    expect(offers.BIG2000.eligible).to.equal(false);
    expect(offers.BIG2000.reason).to.match(/at least ₹2,000/);

    const anon = await agent.post('/admin/orders/quote').send({ items: [{ sku: skus['Black-M'], qty: 1 }], couponCode: 'MEERA150' });
    expect(anon.body.couponError).to.match(/Log in/);
    expect(anon.body.offers.map((o) => o.code)).to.not.include('MEERA150');
  });

  it('creates an order linked to the customer, saves the address, records reason and reference', async () => {
    const res = await agent.post('/admin/orders').send({
      items: [{ sku: skus['Black-L'], qty: 1 }],
      shipping: SHIP,
      paymentMethod: 'prepaid',
      customerId: meera.id,
      saveAddress: true,
      couponCode: 'MEERA150',
      paymentReference: 'UPI 4815162342',
      reason: 'Payment failed on website',
      pushToQikink: false,
    });
    expect(res.status).to.equal(201);
    const order = await Order.findById(res.body.id);
    expect(String(order.customerId)).to.equal(meera.id);
    expect(order).to.include({
      shippingEmail: 'meera@manual.test', status: 'paid', discount: 150, paymentReference: 'UPI 4815162342',
    });
    expect(order.manualReason).to.equal('Payment failed on website');
    expect(order.createdByAdmin).to.exist; // eslint-disable-line no-unused-expressions
    expect(order.statusHistory.at(-1).note).to.match(/Reason: Payment failed.*Payment ref: UPI/);
    expect((await Customer.findById(meera.id)).addresses).to.have.length(1);
  });

  it('can create the customer from the shipping email for a new buyer', async () => {
    const res = await agent.post('/admin/orders').send({
      items: [{ sku: skus['Black-M'], qty: 1 }],
      shipping: { ...SHIP, email: 'New.Buyer@Manual.test' },
      paymentMethod: 'cod',
      createCustomer: true,
      saveAddress: true,
      pushToQikink: false,
    });
    expect(res.status).to.equal(201);
    const created = await Customer.findOne({ email: 'new.buyer@manual.test' });
    expect(created.name).to.equal('Meera Joshi');
    expect(created.addresses).to.have.length(1);
    expect(String((await Order.findById(res.body.id)).customerId)).to.equal(created.id);
  });
});
