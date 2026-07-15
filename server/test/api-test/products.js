const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../server');
const { Product } = require('../../database/models');

chai.use(chaiHttp);
const { expect } = chai;

describe('Products', () => {
  let product;

  before(async () => {
    product = await Product.create({
      slug: 'products-test-tee',
      name: 'Products Test Tee',
      description: 'A tee used only in tests.',
      price: 42.5,
      currency: 'INR',
      images: ['/test.jpg'],
      sizes: ['M', 'L'],
    });
  });

  after(async () => {
    await Product.destroy({ where: { id: product.id } });
  });

  it('GET /products includes the seeded product with the frontend-facing shape', async () => {
    const res = await chai.request(app).get('/products');
    expect(res.status).to.equal(200);
    const found = res.body.find((p) => p.id === product.id);
    expect(found).to.include({
      id: product.id,
      slug: 'products-test-tee',
      name: 'Products Test Tee',
      price: 42.5,
      currency: 'INR',
      inStock: true,
    });
  });

  it('GET /products/:idOrSlug resolves by slug', async () => {
    const res = await chai.request(app).get('/products/products-test-tee');
    expect(res.status).to.equal(200);
    expect(res.body.id).to.equal(product.id);
  });

  it('GET /products/:idOrSlug returns 404 for an unknown slug', async () => {
    const res = await chai.request(app).get('/products/does-not-exist');
    expect(res.status).to.equal(404);
  });
});
