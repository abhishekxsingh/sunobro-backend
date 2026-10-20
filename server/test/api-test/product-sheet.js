const ExcelJS = require('exceljs');
const { expect } = require('chai');
const { Product, ProductVariant } = require('../../database/models');
const { importSheet } = require('../../services/admin/product-sheet');
const { toProductWithVariantsDTO } = require('../../utils/serializers');
const AdminProductsService = require('../../services/admin/products');
const CustomerProductsService = require('../../services/customer/products');
const CustomerOrdersService = require('../../services/customer/orders');

// Same headers as SunoBro-Product-Sheet.xlsx.
const PRODUCT_HEADERS = ['Product name *', 'Description *', 'Selling price ₹ *', 'Status *', 'Cover image URL *',
  'More image URLs (separate with |)', 'URL slug (auto if blank)', 'Qikink Product ID', 'Design name',
  'Print size (W × H in)', 'Variants', 'With Store SKU', 'Ready to publish'];
const VARIANT_HEADERS = ['Product name *', 'Colour *', 'Size *', 'Qikink Store SKU * (v-…)', 'Colour image URL',
  'Price override ₹', 'Qikink Product SKU (reference)', 'Qikink cost ₹', 'Final price ₹', 'Margin ₹', 'Check'];

const NAME = 'Sheet Test Tee';
const COVER = 'https://img.test/cover.jpg';

const sheet = async ({ products, variants }) => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('How to fill').addRow(['instructions']);
  const p = wb.addWorksheet('Products');
  p.addRow(PRODUCT_HEADERS);
  products.forEach((row) => p.addRow(row));
  const v = wb.addWorksheet('Variants');
  v.addRow(VARIANT_HEADERS);
  variants.forEach((row) => v.addRow(row));
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const tee = (overrides = {}) => [NAME, 'A tee for tests', overrides.price ?? 599, overrides.status ?? 'active', COVER,
  'https://img.test/back.jpg', 'sheet-test-tee'];
const row = (color, size, sku, image = '') => [NAME, color, size, sku, image, '', `MRnHs-${size}`, 252];

describe('Product sheet import', () => {
  afterEach(async () => {
    const product = await Product.findOne({ slug: 'sheet-test-tee' });
    if (product) {
      await ProductVariant.deleteMany({ productId: product._id });
      await Product.deleteOne({ _id: product._id });
    }
  });

  it('previews without writing anything', async () => {
    const file = await sheet({
      products: [tee()],
      variants: [row('White', 'M', 'v-test-wm', 'https://img.test/white.jpg'), row('Black', 'M', 'v-test-bm')],
    });
    const result = await importSheet(file, { dryRun: true });

    expect(result.applied).to.equal(false);
    expect(result.problems).to.deep.equal([]);
    expect(result.products[0]).to.include({
      name: NAME, action: 'create', variants: 2, mapped: 2, added: 2,
    });
    expect(await Product.countDocuments({ slug: 'sheet-test-tee' })).to.equal(0);
  });

  it('creates the product with colours, sizes, Store SKUs and colour images', async () => {
    const file = await sheet({
      products: [tee()],
      variants: [row('White', 'M', 'v-test-wm', 'https://img.test/white.jpg'), row('White', 'L', 'v-test-wl', 'https://img.test/white.jpg'),
        row('Black', 'M', 'v-test-bm', 'https://img.test/black.jpg')],
    });
    const result = await importSheet(file, { dryRun: false });
    expect(result.applied).to.equal(true);
    expect(result.results[0]).to.include({ ok: true, slug: 'sheet-test-tee' });

    const product = await Product.findOne({ slug: 'sheet-test-tee' });
    const variants = await ProductVariant.find({ productId: product._id });
    // Imports never publish: a new product waits in review for an admin.
    expect(product.status).to.equal('review');
    expect(product.images).to.deep.equal([COVER, 'https://img.test/back.jpg']);
    expect(variants).to.have.length(3);
    const dto = toProductWithVariantsDTO(product, variants);
    expect(dto.variants.find((v) => v.color === 'Black').image).to.equal('https://img.test/black.jpg');
  });

  it('updates in place on re-upload: price, removed rows, new colour', async () => {
    await importSheet(await sheet({
      products: [tee()],
      variants: [row('White', 'M', 'v-test-wm'), row('White', 'L', 'v-test-wl')],
    }), { dryRun: false });
    const before = await Product.findOne({ slug: 'sheet-test-tee' });
    const keptSku = (await ProductVariant.findOne({ productId: before._id, size: 'M' })).sku;

    const file = await sheet({
      products: [tee({ price: 649 })],
      variants: [row('White', 'M', 'v-test-wm'), row('Navy Blue', 'M', 'v-test-nm', 'https://img.test/navy.jpg')],
    });
    const preview = await importSheet(file, { dryRun: true });
    expect(preview.products[0]).to.include({
      action: 'update', added: 1, removed: 1, kept: 1,
    });

    await importSheet(file, { dryRun: false });
    const after = await Product.findOne({ slug: 'sheet-test-tee' });
    const variants = await ProductVariant.find({ productId: after._id });
    expect(String(after._id)).to.equal(String(before._id));
    expect(after.price).to.equal(649);
    expect(variants.map((v) => `${v.color}/${v.size}`).sort()).to.deep.equal(['Navy Blue/M', 'White/M']);
    expect(variants.find((v) => v.color === 'White').sku).to.equal(keptSku);
  });

  it('rejects a Product SKU in the Store SKU column and writes nothing', async () => {
    const result = await importSheet(await sheet({
      products: [tee()],
      variants: [row('White', 'M', 'MRnHs-Wh-M')],
    }), { dryRun: false });
    expect(result.applied).to.equal(false);
    expect(result.problems[0].message).to.match(/not a Qikink Store SKU/);
    expect(await Product.countDocuments({ slug: 'sheet-test-tee' })).to.equal(0);
  });

  it('imports unmapped rows into review, but they block publishing until mapped or switched off', async () => {
    const result = await importSheet(await sheet({
      products: [tee()],
      variants: [row('White', 'M', 'v-test-wm'), row('White', 'L', '')],
    }), { dryRun: false });
    expect(result.applied).to.equal(true);
    const product = await Product.findOne({ slug: 'sheet-test-tee' });
    expect(product.status).to.equal('review');

    const blocked = await AdminProductsService.update(product.id, { status: 'active' });
    expect(blocked.errors[0].message).to.match(/1\/2 mapped/);

    await AdminProductsService.setAvailability(product.id, { color: 'White', size: 'L', enabled: false });
    const published = await AdminProductsService.update(product.id, { status: 'active' });
    expect(published.doc.status).to.equal('active');
  });

  it('keeps an admin\'s status and switched-off options on re-import', async () => {
    const file = await sheet({
      products: [tee()],
      variants: [row('White', 'M', 'v-test-wm'), row('Black', 'M', 'v-test-bm')],
    });
    await importSheet(file, { dryRun: false });
    const product = await Product.findOne({ slug: 'sheet-test-tee' });
    await AdminProductsService.setAvailability(product.id, { color: 'Black', enabled: false });
    await AdminProductsService.update(product.id, { status: 'active' });

    const again = await importSheet(file, { dryRun: false });
    expect(again.products[0].status).to.equal('active');
    const black = await ProductVariant.findOne({ productId: product._id, color: 'Black' });
    expect(black.enabled).to.equal(false);
  });

  it('hides switched-off options from shoppers and refuses to sell them', async () => {
    await importSheet(await sheet({
      products: [tee()],
      variants: [row('White', 'M', 'v-test-wm', 'https://img.test/white.jpg'), row('Black', 'M', 'v-test-bm', 'https://img.test/black.jpg')],
    }), { dryRun: false });
    const product = await Product.findOne({ slug: 'sheet-test-tee' });
    await AdminProductsService.update(product.id, { status: 'active' });

    const lastOne = await AdminProductsService.setAvailability(product.id, { color: 'White', enabled: false });
    expect(lastOne.doc.variants.find((v) => v.color === 'White').enabled).to.equal(false);
    const refused = await AdminProductsService.setAvailability(product.id, { color: 'Black', enabled: false });
    expect(refused.errors[0].message).to.match(/nothing to buy/);

    const shopper = await CustomerProductsService.get('sheet-test-tee');
    expect(shopper.variants.map((v) => v.color)).to.deep.equal(['Black']);
    const { galleryById } = await CustomerProductsService.list({ limit: 100 });
    expect(galleryById.get(product.id)).to.include('https://img.test/black.jpg')
      .and.not.include('https://img.test/white.jpg');

    const whiteSku = (await ProductVariant.findOne({ productId: product._id, color: 'White' })).sku;
    const order = await CustomerOrdersService.create({
      items: [{ sku: whiteSku, qty: 1 }],
      shipping: {
        firstName: 'A', lastName: 'B', street: 'S', city: 'C', postalCode: '1', country: 'India', phone: '9876543210',
      },
    });
    expect(order.errors[0].message).to.match(/no longer available/);
  });
});
