const { expect } = require('chai');
const sinon = require('sinon');
const {
  Coupon, Customer, Order, Product, ProductVariant,
} = require('../../database/models');
const AdminProductsService = require('../../services/admin/products');
const AdminCouponsService = require('../../services/admin/coupons');
const AdminOrdersService = require('../../services/admin/orders');
const CustomerOrdersService = require('../../services/customer/orders');
const CustomerCouponsService = require('../../services/customer/coupons');
const PaymentService = require('../../services/customer/payment');
const QikinkService = require('../../services/admin/qikink');
const emailService = require('../../services/email');

const SLUG = 'coupon-test-tee';
const shipping = (email) => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  street: '12 MG Road',
  city: 'Bengaluru',
  postalCode: '560001',
  country: 'India',
  phone: '9876543210',
  email,
});

describe('Coupons', function coupons() {
  this.timeout(20000);
  let sku;
  let alice;
  let bob;
  let fulfil;

  const coupon = async (data) => {
    const { doc, errors } = await AdminCouponsService.save(null, {
      discountType: 'percent', value: 10, ...data,
    });
    if (errors) throw new Error(errors[0].message);
    return doc;
  };
  const order = (couponCode, { qty = 1, email = 'guest@test.io', customerId = null } = {}) => (
    CustomerOrdersService.create({ items: [{ sku, qty }], shipping: shipping(email), couponCode }, customerId)
  );
  const pay = (doc) => PaymentService.markPaidAndFulfill(doc, `pay_${doc.id}`);

  before(async () => {
    await AdminProductsService.create({
      name: 'Coupon Tee',
      slug: SLUG,
      price: 600,
      status: 'active',
      images: ['https://img.test/c.jpg'],
      variants: [{ size: 'M', color: 'Black', qikinkSku: 'v-coupon-bm' }],
    });
    const product = await Product.findOne({ slug: SLUG });
    ({ sku } = await ProductVariant.findOne({ productId: product._id }));
    [alice, bob] = await Customer.create([
      { name: 'Alice', email: 'alice@coupon.test' },
      { name: 'Bob', email: 'bob@coupon.test' },
    ]);
  });

  beforeEach(() => {
    fulfil = sinon.stub(QikinkService, 'fulfillOrder').resolves({ order: null });
    sinon.stub(emailService, 'sendOrderConfirmation').resolves();
    sinon.stub(emailService, 'sendOrderStatus').resolves();
  });

  afterEach(async () => {
    fulfil.restore();
    emailService.sendOrderConfirmation.restore();
    emailService.sendOrderStatus.restore();
    await Order.deleteMany({ shippingFirstName: 'Ada' });
    await Coupon.deleteMany({});
  });

  after(async () => {
    const product = await Product.findOne({ slug: SLUG });
    await ProductVariant.deleteMany({ productId: product._id });
    await Product.deleteOne({ _id: product._id });
    await Customer.deleteMany({ email: /@coupon\.test$/ });
  });

  it('takes percent (capped) and flat discounts off the server-side total', async () => {
    await coupon({ code: 'diwali20', value: 20, maxDiscount: 150 });
    await coupon({ code: 'FLAT100', discountType: 'flat', value: 100 });

    const capped = await order('DIWALI20', { qty: 2 }); // 20% of 1200 = 240 → capped at 150
    expect(capped.doc.subtotal).to.equal(1200);
    expect(capped.doc.discount).to.equal(150);
    expect(capped.doc.total).to.equal(1050);
    expect(capped.doc.couponCode).to.equal('DIWALI20');

    const flat = await order(' flat100 ');
    expect(flat.doc.total).to.equal(500);

    const { payload } = await QikinkService.buildOrderPayload(capped.doc);
    expect(payload.total_order_value).to.equal('1050');
    expect(payload.line_items[0].price).to.equal('525'); // 600 × 1050/1200
  });

  it('rejects unknown, disabled, scheduled, expired and below-minimum codes without touching stock', async () => {
    const day = 24 * 3600 * 1000;
    await coupon({ code: 'OFF1', active: false });
    await coupon({ code: 'SOON', startsAt: new Date(Date.now() + day).toISOString() });
    await coupon({ code: 'OLD', endsAt: new Date(Date.now() - day).toISOString() });
    await coupon({ code: 'BIG', minOrderValue: 1000 });

    expect((await order('NOPE')).errors[0].message).to.match(/not a valid coupon/);
    expect((await order('OFF1')).errors[0].message).to.match(/not valid/);
    expect((await order('SOON')).errors[0].message).to.match(/isn't active yet/);
    expect((await order('OLD')).errors[0].message).to.match(/expired/);
    expect((await order('BIG')).errors[0].message).to.match(/at least ₹1,000/);
    expect(await Order.countDocuments({ shippingFirstName: 'Ada' })).to.equal(0);
  });

  it('counts a use only when paid, enforces the per-customer limit, and gives it back on cancel', async () => {
    const c = await coupon({ code: 'ONCE', perCustomerLimit: 1 });

    const abandoned = await order('ONCE');
    const second = await order('ONCE'); // an unpaid order doesn't use the coupon up
    expect(second.doc).to.be.an('object');
    expect((await Coupon.findById(c.id)).usedCount).to.equal(0);

    await pay(second.doc);
    expect((await Coupon.findById(c.id)).usedCount).to.equal(1);
    await pay(second.doc); // verify + webhook racing — still one use
    expect((await Coupon.findById(c.id)).usedCount).to.equal(1);

    expect((await order('ONCE', { email: 'GUEST@test.io' })).errors[0].message).to.match(/already used/);
    expect((await order('ONCE', { email: 'other@test.io' })).doc).to.be.an('object');

    // The abandoned order can no longer be paid with the coupon.
    const recheck = await PaymentService.createOrder({ orderId: abandoned.doc.id });
    expect(recheck.type).to.equal('conflict');
    expect(recheck.errors[0].message).to.match(/already used.*Remove the coupon/);

    await AdminOrdersService.updateStatus(second.doc.id, { status: 'cancelled' });
    expect((await Coupon.findById(c.id)).usedCount).to.equal(0);
    expect((await order('ONCE')).doc).to.be.an('object');
  });

  it('stops at the total usage limit', async () => {
    await coupon({ code: 'FIRST2', usageLimit: 2, perCustomerLimit: null });
    await pay((await order('FIRST2', { email: 'a@test.io' })).doc);
    await pay((await order('FIRST2', { email: 'b@test.io' })).doc);
    expect((await order('FIRST2', { email: 'c@test.io' })).errors[0].message).to.match(/fully redeemed/);
  });

  it('limits customer coupons to the customers they were issued to', async () => {
    await coupon({ code: 'ALICE15', kind: 'customer', customerIds: [alice.id] });
    expect((await order('ALICE15')).errors[0].message).to.match(/Log in/);
    expect((await order('ALICE15', { customerId: bob.id })).errors[0].message).to.match(/isn't available on this account/);
    expect((await order('ALICE15', { customerId: alice.id })).doc.discount).to.equal(60);

    const missing = await AdminCouponsService.save(null, {
      code: 'NOBODY', kind: 'customer', discountType: 'flat', value: 50,
    });
    expect(missing.errors[0].message).to.match(/at least one customer/);
  });

  it('honours first-order-only', async () => {
    await coupon({ code: 'WELCOME', firstOrderOnly: true, perCustomerLimit: null });
    await pay((await order(null, { email: 'old@test.io' })).doc);
    expect((await order('WELCOME', { email: 'Old@Test.io' })).errors[0].message).to.match(/first order/);
    expect((await order('WELCOME', { email: 'new@test.io' })).doc).to.be.an('object');
  });

  it('lists checkout offers plus coupons issued to the logged-in customer', async () => {
    await coupon({ code: 'PUBLIC', showAtCheckout: true });
    await coupon({ code: 'HIDDEN' });
    await coupon({ code: 'FORALICE', kind: 'customer', customerIds: [alice.id] });

    const guest = await CustomerCouponsService.available(null);
    expect(guest.doc.map((o) => o.code)).to.deep.equal(['PUBLIC']);
    const mine = await CustomerCouponsService.available(alice.id);
    expect(mine.doc.map((o) => o.code)).to.have.members(['PUBLIC', 'FORALICE']);
    expect(mine.doc.find((o) => o.code === 'FORALICE').personal).to.equal(true);

    const quote = await CustomerCouponsService.quote({ code: 'public', items: [{ sku, qty: 1 }] });
    expect(quote.doc).to.include({ code: 'PUBLIC', discount: 60, total: 540 });
  });

  it('admin rules: unique codes, percent ≤ 100, used coupons are switched off not deleted', async () => {
    await coupon({ code: 'DUP' });
    expect((await AdminCouponsService.save(null, { code: 'dup', discountType: 'flat', value: 1 })).type).to.equal('conflict');
    expect((await AdminCouponsService.save(null, { code: 'TOOMUCH', discountType: 'percent', value: 150 })).errors[0].message)
      .to.match(/at most 100/);

    const used = await coupon({ code: 'USED' });
    await order('USED');
    expect((await AdminCouponsService.remove(used.id)).errors[0].message).to.match(/switch it off/);
    const off = await AdminCouponsService.save(used.id, { active: false });
    expect(off.doc.state).to.equal('disabled');

    const unused = await coupon({ code: 'UNUSED' });
    expect((await AdminCouponsService.remove(unused.id)).doc).to.be.an('object');
  });

  it('applies coupons to admin-created COD orders and counts them straight away', async () => {
    const c = await coupon({ code: 'PHONE50', discountType: 'flat', value: 50 });
    const { doc } = await AdminOrdersService.create({
      items: [{ sku, qty: 1 }], shipping: shipping('cod@test.io'), paymentMethod: 'cod', couponCode: 'PHONE50', pushToQikink: false,
    });
    expect(doc.value).to.equal(550);
    expect(doc.discount).to.equal(50);
    expect((await Coupon.findById(c.id)).usedCount).to.equal(1);
  });
});
