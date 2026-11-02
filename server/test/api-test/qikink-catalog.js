const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { QIKINK } = require('../../config');
const { Product, ProductVariant } = require('../../database/models');
const Catalog = require('../../services/admin/qikink-catalog');
const AdminProductsService = require('../../services/admin/products');
const { generateQikinkImageUrl } = require('../../utils/qikink-image');

// Real files copied from the Qikink dashboard (My Products export, and the
// Product Variations table of the "shipfix" product).
const EXPORT = fs.readFileSync(path.join(__dirname, '../fixtures/qikink-export.csv'), 'utf8');
const VARIATIONS = fs.readFileSync(path.join(__dirname, '../fixtures/qikink-variations-shipfix.tsv'), 'utf8');
const IMG = (n) => `https://qikink-assets.test/clientProducts/32475034/images/Front_1_c_${n}.jpg`;
const ASSET_CLIENT = '621544';

const cleanUp = async () => {
  const products = await Product.find({ qikinkProductId: { $exists: true } });
  await ProductVariant.deleteMany({ productId: { $in: products.map((p) => p._id) } });
  await Product.deleteMany({ _id: { $in: products.map((p) => p._id) } });
};

describe('generateQikinkImageUrl', () => {
  it('builds the S3 default mockup path and skips incomplete ids', () => {
    expect(generateQikinkImageUrl({ clientId: ASSET_CLIENT, clientProductId: '32474985' }))
      .to.equal(`https://qikink-assets.s3.ap-south-1.amazonaws.com/clients/${ASSET_CLIENT}/clientProducts/32474985/images/default.jpg`);
    expect(generateQikinkImageUrl({
      clientId: ASSET_CLIENT, clientProductId: '32474985', file: 'Front_1_c_1.jpg',
    })).to.equal(`https://qikink-assets.s3.ap-south-1.amazonaws.com/clients/${ASSET_CLIENT}/clientProducts/32474985/images/Front_1_c_1.jpg`);
    expect(generateQikinkImageUrl({ clientId: ASSET_CLIENT })).to.equal(null);
    expect(generateQikinkImageUrl({ clientProductId: '32474985' })).to.equal(null);
  });
});

describe('Qikink two-step catalog', function qikinkCatalog() {
  // Ten products and 60 variants against a remote test database.
  this.timeout(30000);
  const previousAssetClient = QIKINK.ASSET_CLIENT_ID;
  afterEach(async () => {
    QIKINK.ASSET_CLIENT_ID = previousAssetClient;
    await cleanUp();
  });

  it('reads the My Products export: design names, counts, sizes, price', () => {
    const { rows, problems } = Catalog.parseExport(EXPORT);
    expect(problems).to.deep.equal([]);
    expect(rows).to.have.length(10);
    expect(rows[0]).to.include({
      productId: '64950068', design: 'shipfix', colourCount: 12, sizeRange: 'XS - XL', expectedVariants: 60, price: 599,
    });
    expect(Catalog.nameFromDesign(rows[1].design, rows[1].title, rows[1].productId)).to.equal('Gitblame Tee');
    // Random hash design names fall back to the Qikink title + id.
    expect(Catalog.nameFromDesign(rows[8].design, rows[8].title, rows[8].productId))
      .to.equal('Unisex Classic Crew T-Shirt #64949872');
  });

  it('step 1 creates review shells once, and re-uploads update instead of duplicating', async () => {
    const preview = await Catalog.importExport(EXPORT, { dryRun: true });
    expect(preview.applied).to.equal(false);
    expect(preview.products.every((p) => p.action === 'create')).to.equal(true);
    expect(await Product.countDocuments({ qikinkProductId: { $exists: true } })).to.equal(0);

    const first = await Catalog.importExport(EXPORT, { dryRun: false });
    expect(first.results).to.have.length(10);
    const shipfix = await Product.findOne({ qikinkProductId: '64950068' });
    expect(shipfix).to.include({
      name: 'Shipfix Tee', status: 'review', price: 599, qikinkExpectedVariants: 60,
    });

    await AdminProductsService.update(shipfix.id, { name: 'Ship It, Fix It Later Tee', price: 649 });
    const again = await Catalog.importExport(EXPORT, { dryRun: false });
    expect(again.results.every((r) => r.action === 'update')).to.equal(true);
    expect(await Product.countDocuments({ qikinkProductId: { $exists: true } })).to.equal(10);
    const kept = await Product.findById(shipfix._id);
    expect(kept).to.include({ name: 'Ship It, Fix It Later Tee', price: 649 });
  });

  it('step 2 turns a pasted Product Variations table into 60 mapped variants with colour images', async () => {
    await Catalog.importExport(EXPORT, { dryRun: false });
    const product = await Product.findOne({ qikinkProductId: '64950068' });
    const images = {
      White: IMG(1), Black: IMG(2), 'Navy Blue': IMG(3), 'Grey Melange': IMG(4),
    };

    const preview = await Catalog.applyVariations(product.id, { text: VARIATIONS, images, dryRun: true });
    expect(preview.problems).to.deep.equal([]);
    expect(preview).to.include({ variants: 60, expected: 60 });
    expect(preview.warnings).to.deep.equal([]);
    expect(preview.colours).to.have.length(12);
    expect(preview.colours[0]).to.include({ colour: 'White', image: IMG(1) });
    expect(preview.colours[0].sizes).to.deep.equal(['XS', 'S', 'M', 'L', 'XL']);
    expect(await ProductVariant.countDocuments({ productId: product._id })).to.equal(0);

    const applied = await Catalog.applyVariations(product.id, { text: VARIATIONS, images, dryRun: false });
    expect(applied.applied).to.equal(true);
    const variants = await ProductVariant.find({ productId: product._id });
    expect(variants).to.have.length(60);
    expect(variants.every((v) => v.qikinkSku.startsWith('v-'))).to.equal(true);
    expect(variants.find((v) => v.color === 'Black').image).to.equal(IMG(2));
    expect(variants.find((v) => v.color === 'White').qikinkCost).to.equal(265.87);
    const saved = await Product.findById(product._id);
    expect(saved.status).to.equal('review');
    expect(saved.images).to.deep.equal([IMG(1)]);

    const published = await AdminProductsService.update(product.id, { status: 'active' });
    expect(published.doc.status).to.equal('active');
  });

  it('does not invent a cover from the My Products Product ID (that id is not the S3 folder)', async () => {
    QIKINK.ASSET_CLIENT_ID = ASSET_CLIENT;
    const first = await Catalog.importExport(EXPORT, { dryRun: false });
    expect(first.applied).to.equal(true);
    const shipoff = await Product.findOne({ qikinkProductId: '64950068' });
    expect(shipoff.images).to.deep.equal([]);

    await Product.updateOne({ _id: shipoff._id }, { $set: { images: [IMG(9)] } });
    await Catalog.importExport(EXPORT, { dryRun: false });
    const kept = await Product.findById(shipoff._id);
    expect(kept.images).to.deep.equal([IMG(9)]);
  });

  it('leaves colour images empty when none are pasted (no invented S3 cover)', async () => {
    QIKINK.ASSET_CLIENT_ID = ASSET_CLIENT;
    await Catalog.importExport(EXPORT, { dryRun: false });
    const product = await Product.findOne({ qikinkProductId: '64950068' });
    const preview = await Catalog.applyVariations(product.id, { text: VARIATIONS, dryRun: true });
    expect(preview.colours[0].image).to.equal('');
  });

  it('warns when rows are missing and rejects Product SKUs pasted as Store SKUs', async () => {
    await Catalog.importExport(EXPORT, { dryRun: false });
    const product = await Product.findOne({ qikinkProductId: '64950068' });
    const firstTen = VARIATIONS.split('\n').slice(0, 11).join('\n');
    const partial = await Catalog.applyVariations(product.id, { text: firstTen, dryRun: true });
    expect(partial.warnings[0]).to.match(/60 variants; the pasted table has 10/);

    const wrongColumn = 'White - M\tMRnHs-Wh-M\nBlack - M\tMRnHs-Bk-M'
      .split('\n').map((r) => `Unisex\t${r.split('\t')[0]}\t${r.split('\t')[1]}\tshipfix\t${r.split('\t')[1]}\t\t265\t599`).join('\n');
    const rejected = await Catalog.applyVariations(product.id, { text: wrongColumn, dryRun: false });
    expect(rejected.applied).to.equal(false);
    expect(rejected.problems[0].message).to.match(/not a Store SKU/);
    expect(await ProductVariant.countDocuments({ productId: product._id })).to.equal(0);
  });
});
