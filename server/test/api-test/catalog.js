const { expect } = require('chai');
const sinon = require('sinon');
const { Order, Product, ProductVariant } = require('../../database/models');
const AdminProductsService = require('../../services/admin/products');
const AdminOrdersService = require('../../services/admin/orders');
const CustomerOrdersService = require('../../services/customer/orders');

const SHIPPING = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  street: '12 MG Road',
  city: 'Bengaluru',
  postalCode: '560001',
  country: 'India',
  phone: '9876543210',
};

const variants = [
  { size: 'M', color: 'Black', qikinkSku: 'MVnHs-Bk-M' },
  { size: 'M', color: 'White', qikinkSku: 'MVnHs-Wh-M' },
];

describe('Catalog ↔ Qikink mapping', () => {
  const slugs = [];
  const create = async (payload) => {
    const slug = `cat-test-${Math.random().toString(36).slice(2, 8)}`;
    slugs.push(slug);
    return AdminProductsService.create({
      name: 'Catalog Tee', slug, price: 499, ...payload,
    });
  };

  afterEach(async () => {
    const products = await Product.find({ slug: { $in: slugs } });
    await ProductVariant.deleteMany({ productId: { $in: products.map((p) => p._id) } });
    await Product.deleteMany({ slug: { $in: slugs } });
    await Order.deleteMany({ source: 'admin' });
    slugs.length = 0;
  });

  it('publishes a product only when every variant has its own Qikink SKU', async () => {
    const ok = await create({ variants, status: 'active' });
    expect(ok.doc.status).to.equal('active');
    expect(ok.doc.mappedCount).to.equal(2);

    const unmapped = await create({ variants: [{ size: 'M', color: 'Black' }], status: 'active' });
    expect(unmapped.type).to.equal('conflict');
    expect(unmapped.errors[0].message).to.match(/0\/1 mapped/);

    const autoDraft = await create({ variants: [{ size: 'M', color: 'Black' }] });
    expect(autoDraft.doc.status).to.equal('draft');
  });

  it('rejects two colours sharing one Qikink SKU', async () => {
    const result = await create({
      variants: [
        { size: 'M', color: 'Black', qikinkSku: 'SAME' },
        { size: 'M', color: 'White', qikinkSku: 'SAME' },
      ],
    });
    expect(result.errors[0].name).to.equal('qikinkSku');
  });

  it('never generates a colour-blind Qikink SKU for multi-colour products', async () => {
    const { doc } = await create({ sizes: ['M'], colors: ['Black', 'White'], qikinkSku: 'BASE' });
    expect(doc.variants.every((v) => v.qikinkSku === null)).to.equal(true);
    expect(doc.status).to.equal('draft');
  });

  it('keeps variant SKUs and stock when a product is edited', async () => {
    const { doc } = await create({ variants: variants.map((v) => ({ ...v, stock: 7 })) });
    const before = doc.variants.find((v) => v.color === 'Black');

    const { doc: edited } = await AdminProductsService.update(doc.id, {
      name: 'Renamed Tee',
      variants: [
        { size: 'M', color: 'Black', qikinkSku: 'MVnHs-Bk-M2' },
        { size: 'L', color: 'Black', qikinkSku: 'MVnHs-Bk-L' },
      ],
    });

    const after = edited.variants.find((v) => v.color === 'Black' && v.size === 'M');
    expect(after.sku).to.equal(before.sku);
    expect(after.stock).to.equal(7);
    expect(after.qikinkSku).to.equal('MVnHs-Bk-M2');
    expect(edited.variants).to.have.length(2);
    expect(edited.name).to.equal('Renamed Tee');
  });

  it('does not enforce stock for print-on-demand products', async () => {
    const { doc } = await create({ variants: variants.map((v) => ({ ...v, stock: 0 })), status: 'active' });
    const { sku } = doc.variants[0];

    const order = await CustomerOrdersService.create({ items: [{ sku, qty: 3 }], shipping: SHIPPING });
    expect(order.doc.total).to.equal(1497);
    expect((await ProductVariant.findOne({ sku })).stock).to.equal(0);
    await Order.findByIdAndDelete(order.doc._id);
  });

  it('refuses storefront orders for draft products', async () => {
    const { doc } = await create({ variants: [{ size: 'M', color: 'Black' }] });
    const result = await CustomerOrdersService.create({
      items: [{ sku: doc.variants[0].sku, qty: 1 }], shipping: SHIPPING,
    });
    expect(result.doc).to.equal(undefined);
    expect(result.errors[0].message).to.match(/no longer available/);
  });

  describe('admin-created orders', () => {
    let fetchStub;
    let created;

    beforeEach(() => {
      created = [];
      fetchStub = sinon.stub(global, 'fetch').callsFake(async (url, init = {}) => {
        const { pathname } = new URL(url);
        const json = (body) => ({ ok: true, status: 200, json: async () => body });
        if (pathname === '/api/token') return json({ Accesstoken: 'token', expires_in: 3600 });
        if (pathname === '/api/order/create') {
          created.push(JSON.parse(init.body));
          return json({ order_id: 900 + created.length, status_code: '200' });
        }
        return json({ success: true, data: [] });
      });
    });

    afterEach(() => fetchStub.restore());

    it('creates a prepaid order as paid and pushes it to Qikink', async () => {
      const { doc } = await create({ variants, status: 'active' });
      const result = await AdminOrdersService.create({
        items: [{ sku: doc.variants[0].sku, qty: 1 }],
        shipping: SHIPPING,
        paymentMethod: 'prepaid',
      });

      expect(result.doc.status).to.equal('paid');
      expect(result.doc.source).to.equal('admin');
      expect(result.doc.qikinkOrderId).to.equal('901');
      expect(created[0].gateway).to.equal('Prepaid');
    });

    it('sends COD orders to Qikink as COD and keeps them pending', async () => {
      const { doc } = await create({ variants, status: 'active' });
      const result = await AdminOrdersService.create({
        items: [{ sku: doc.variants[1].sku, qty: 2 }],
        shipping: SHIPPING,
        paymentMethod: 'cod',
      });

      expect(result.doc.status).to.equal('pending');
      expect(result.doc.paymentGateway).to.equal('cod');
      expect(result.doc.qikinkOrderId).to.equal('901');
      expect(created[0].gateway).to.equal('COD');
      expect(created[0].line_items[0]).to.include({ sku: 'MVnHs-Wh-M', quantity: '2' });
    });

    it('can create without pushing, for a later manual push', async () => {
      const { doc } = await create({ variants, status: 'active' });
      const result = await AdminOrdersService.create({
        items: [{ sku: doc.variants[0].sku, qty: 1 }],
        shipping: SHIPPING,
        paymentMethod: 'prepaid',
        pushToQikink: false,
      });
      expect(result.doc.qikinkOrderId).to.equal(null);
      expect(created).to.have.length(0);

      const pushed = await AdminOrdersService.pushToQikink(result.doc.id);
      expect(pushed.doc.qikinkOrderId).to.equal('901');
    });
  });
});
