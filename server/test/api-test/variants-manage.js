const { expect } = require('chai');
const { Product, ProductVariant } = require('../../database/models');
const Products = require('../../services/admin/products');

const SLUG = 'manage-test-tee';
const IMG = (n) => `https://img.test/${n}.jpg`;

describe('Adding colours and sizes to a product', function manageVariants() {
  this.timeout(20000);
  let id;

  beforeEach(async () => {
    const { doc } = await Products.create({
      name: 'Manage Test Tee',
      slug: SLUG,
      price: 599,
      images: [IMG('white')],
      variants: [{
        color: 'White', size: 'M', qikinkSku: 'v-test-wm', image: IMG('white'),
      }],
    });
    ({ id } = doc);
  });

  afterEach(async () => {
    const product = await Product.findOne({ slug: SLUG });
    if (product) {
      await ProductVariant.deleteMany({ productId: product._id });
      await Product.deleteOne({ _id: product._id });
    }
  });

  it('adds a new colour with its sizes, Store SKUs and image', async () => {
    const { doc } = await Products.addVariants(id, {
      color: 'Black',
      image: IMG('black'),
      sizes: [{ size: 'M', qikinkSku: 'v-test-bm' }, { size: 'L', qikinkSku: 'v-test-bl' }],
    });
    const black = doc.variants.filter((v) => v.color === 'Black');
    expect(black.map((v) => v.size)).to.have.members(['M', 'L']);
    expect(black.every((v) => v.image === IMG('black') && v.qikinkSku.startsWith('v-'))).to.equal(true);
    expect(doc.sizes).to.include('L');
  });

  it('adds a size to an existing colour and reuses that colour\'s image', async () => {
    const { doc } = await Products.addVariants(id, { color: 'white', sizes: [{ size: 'XL', qikinkSku: 'v-test-wxl' }] });
    const added = doc.variants.find((v) => v.size === 'XL');
    expect(added.color).to.equal('white');
    expect(added.image).to.equal(IMG('white'));
  });

  it('refuses duplicates, Product SKUs, and unmapped options on a live product', async () => {
    const dup = await Products.addVariants(id, { color: 'White', sizes: [{ size: 'M', qikinkSku: 'v-test-x' }] });
    expect(dup.errors[0].message).to.match(/already on this product/);

    const wrong = await Products.addVariants(id, { color: 'Black', sizes: [{ size: 'M', qikinkSku: 'MRnHs-Bk-M' }] });
    expect(wrong.errors[0].message).to.match(/not a Qikink Store SKU/);

    const reused = await Products.addVariants(id, { color: 'Black', sizes: [{ size: 'M', qikinkSku: 'v-test-wm' }] });
    expect(reused.errors[0].message).to.match(/already used/);

    await Products.update(id, { status: 'active' });
    const unmapped = await Products.addVariants(id, { color: 'Black', sizes: [{ size: 'M' }] });
    expect(unmapped.errors[0].message).to.match(/live/);
    expect(await ProductVariant.countDocuments({ productId: id })).to.equal(1);
  });

  it('changes and clears the image for every size of a colour', async () => {
    await Products.addVariants(id, { color: 'White', sizes: [{ size: 'L', qikinkSku: 'v-test-wl' }] });
    const { doc } = await Products.setColourImage(id, { color: 'WHITE', image: IMG('white-v2') });
    expect(doc.variants.every((v) => v.image === IMG('white-v2'))).to.equal(true);

    const cleared = await Products.setColourImage(id, { color: 'White', image: '' });
    expect(cleared.doc.variants.every((v) => v.image === null)).to.equal(true);

    const bad = await Products.setColourImage(id, { color: 'White', image: 'not a link' });
    expect(bad.errors[0].message).to.match(/https/);
  });
});
