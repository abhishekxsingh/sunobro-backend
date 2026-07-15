const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();

    const adminId = uuidv4();
    await queryInterface.bulkInsert('admins', [{
      id: adminId,
      name: 'Sunobro Ops',
      email: 'ops@sunobro.com',
      password_hash: await bcrypt.hash('ChangeMe123!', 10),
      role: 'admin',
      created_at: now,
      updated_at: now,
    }]);

    const products = [
      {
        id: uuidv4(),
        slug: 'compile-tee',
        name: 'Compile',
        description: 'Heavyweight cotton tee for people who ship.',
        price: 65.0,
        images: JSON.stringify(['/products/compile-1.jpg', '/products/compile-2.jpg']),
        sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
      },
      {
        id: uuidv4(),
        slug: 'runtime-tee',
        name: 'Runtime',
        description: 'Soft-touch tee, minimal print.',
        price: 55.0,
        images: JSON.stringify(['/products/runtime-1.jpg']),
        sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      },
    ];

    await queryInterface.bulkInsert('products', products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: 'INR',
      images: p.images,
      sizes: p.sizes,
      in_stock: true,
      status: 'active',
      created_at: now,
      updated_at: now,
    })));

    const colors = ['Black', 'White'];
    const variants = [];
    products.forEach((product) => {
      JSON.parse(product.sizes).forEach((size) => {
        colors.forEach((color) => {
          variants.push({
            id: uuidv4(),
            product_id: product.id,
            size,
            color,
            sku: `${product.slug}-${size}-${color}`.toUpperCase(),
            stock: Math.floor(Math.random() * 40) + 1,
            price: null,
            qikink_sku: null,
            created_at: now,
            updated_at: now,
          });
        });
      });
    });

    await queryInterface.bulkInsert('product_variants', variants);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('product_variants', null, {});
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('admins', { email: 'ops@sunobro.com' }, {});
  },
};
