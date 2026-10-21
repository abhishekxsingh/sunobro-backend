/* eslint-disable no-console */
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MONGODB_URI } = require('../../config');

const Admin = require('../models/admin');
const Product = require('../models/product');
const ProductVariant = require('../models/product-variant');

const productsData = [
  {
    slug: 'compile-tee',
    name: 'Compile Oversized Tee',
    description: 'Heavyweight 300GSM cotton tee engineered for deep-work sessions. Minimal print, maximum comfort.',
    price: 1499,
    currency: 'INR',
    images: [
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=80',
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    status: 'active',
    inStock: true,
  },
  {
    slug: 'runtime-hoodie',
    name: 'Runtime Hoodie',
    description: 'Merino-blend technical hoodie for cold office nights and late deploys.',
    price: 2999,
    currency: 'INR',
    images: [
      'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80',
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    status: 'active',
    inStock: true,
  },
  {
    slug: 'packet-cap',
    name: 'Packet Cap',
    description: 'Structured 6-panel cap with embroidered circuit mark. One size fits most.',
    price: 899,
    currency: 'INR',
    images: [
      'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800&q=80',
    ],
    sizes: ['One Size'],
    status: 'active',
    inStock: true,
  },
  {
    slug: 'latency-cargo',
    name: 'Latency Cargo Pants',
    description: '4-way stretch utility pants with cable-management loops and reinforced knees.',
    price: 3499,
    currency: 'INR',
    images: [
      'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80',
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    status: 'active',
    inStock: true,
  },
  {
    slug: 'buffer-tote',
    name: 'Buffer Tote 24L',
    description: 'Modular tote with padded 16" laptop sleeve and water-resistant shell.',
    price: 1999,
    currency: 'INR',
    images: [
      'https://images.unsplash.com/photo-1590874103328-eac38a67437a?w=800&q=80',
    ],
    sizes: ['One Size'],
    status: 'active',
    inStock: true,
  },
];

const Order = require('../models/order');
const Customer = require('../models/customer');

// This script DELETES every admin, product and variant before inserting demo
// data. It is for an empty local/dev database only. It never runs on deploy
// or server start — and it refuses to touch a database that already has data
// unless you name that exact database:
//   SEED_CONFIRM_DB=<database name> npm run db:seed
async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed with NODE_ENV=production.');
  }
  await mongoose.connect(MONGODB_URI);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`Connected to MongoDB — database "${dbName}"`);

  const [adminCount, productCount, orderCount, customerCount] = await Promise.all([
    Admin.countDocuments(), Product.countDocuments(), Order.countDocuments(), Customer.countDocuments(),
  ]);
  const hasData = adminCount + productCount + orderCount + customerCount > 0;
  if (hasData && process.env.SEED_CONFIRM_DB !== dbName) {
    await mongoose.disconnect();
    throw new Error(
      `"${dbName}" already has data (${adminCount} admins, ${productCount} products, `
      + `${orderCount} orders, ${customerCount} customers). Seeding would delete admins and products. Nothing was changed. `
      + `If this really is a throwaway database, re-run with SEED_CONFIRM_DB=${dbName}.`,
    );
  }

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
  console.log('Admin created: admin@sunobro.com');

  const products = await Product.insertMany(productsData);
  console.log(`${products.length} products created`);

  const colors = ['Black', 'White'];
  const variants = [];
  products.forEach((product) => {
    product.sizes.forEach((size) => {
      colors.forEach((color) => {
        const sku = `${product.slug}-${color}-${size}`
          .toUpperCase()
          .replace(/\s+/g, '-');
        variants.push({
          productId: product._id,
          size,
          color,
          sku,
          stock: 50,
          qikinkSku: undefined,
        });
      });
    });
  });

  await ProductVariant.insertMany(variants);
  console.log(`${variants.length} variants created`);

  products.forEach((p) => {
    console.log(`  • ${p.name} — ₹${p.price} (/${p.slug})`);
  });

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
