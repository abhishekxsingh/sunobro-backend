/* eslint-disable no-console */
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MONGODB_URI } = require('../../config');

const Admin = require('../models/admin');
const Product = require('../models/product');
const ProductVariant = require('../models/product-variant');

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  await Promise.all([
    Admin.deleteMany({}),
    Product.deleteMany({}),
    ProductVariant.deleteMany({}),
  ]);
  console.log('Cleared existing data');

  await Admin.create({
    name: 'Sunobro Admin',
    email: 'admin@sunobro.com',
    passwordHash: await bcrypt.hash('kwugdiwudgwid12@', 10),
    role: 'admin',
  });
  console.log('Admin created');

  const productsData = [
    {
      slug: 'compile-tee',
      name: 'Compile',
      description: 'Heavyweight cotton tee for people who ship.',
      price: 65,
      currency: 'INR',
      images: ['/products/compile-1.jpg', '/products/compile-2.jpg'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    },
    {
      slug: 'runtime-tee',
      name: 'Runtime',
      description: 'Soft-touch tee, minimal print.',
      price: 55,
      currency: 'INR',
      images: ['/products/runtime-1.jpg'],
      sizes: ['S', 'M', 'L', 'XL'],
    },
  ];

  const products = await Product.insertMany(productsData);
  console.log(`${products.length} products created`);

  const colors = ['Black', 'White'];
  const variants = [];
  products.forEach((product) => {
    product.sizes.forEach((size) => {
      colors.forEach((color) => {
        variants.push({
          productId: product._id,
          size,
          color,
          sku: `${product.slug}-${size}-${color}`.toUpperCase(),
          stock: Math.floor(Math.random() * 40) + 1,
        });
      });
    });
  });

  await ProductVariant.insertMany(variants);
  console.log(`${variants.length} variants created`);

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
