const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../server');
const {
  Admin, Customer, Order,
} = require('../../database/models');
const password = require('../../utils/password');

chai.use(chaiHttp);
const { expect } = chai;

const order = (customer, extra) => ({
  reference: `SB-T${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
  customerId: customer._id,
  subtotal: 599,
  total: 599,
  shippingEmail: customer.email,
  shippingPhone: customer.phone,
  shippingFirstName: customer.name.split(' ')[0],
  shippingLastName: customer.name.split(' ')[1] || '-',
  shippingStreet: '6 Lane',
  shippingCity: 'Varanasi',
  shippingPostalCode: '221003',
  shippingCountry: 'India',
  items: [{
    name: 'Gitblame Tee', size: 'L', color: 'Black', sku: 'GITBLAME-BLACK-L', qikinkSku: 'v-gb-l', price: 599, qty: 1,
  }],
  ...extra,
});

describe('Admin customers and order search', function adminCustomers() {
  this.timeout(20000);
  let agent;
  let riya;
  let dev;

  before(async () => {
    await Admin.deleteMany({ email: 'cust-admin@customers.test' });
    await Admin.create({
      name: 'Ops', email: 'cust-admin@customers.test', role: 'ops', passwordHash: await password.hash('admin-pass-1234'),
    });
    agent = chai.request.agent(app);
    await agent.post('/admin/auth/login').send({ email: 'cust-admin@customers.test', password: 'admin-pass-1234' });

    await Customer.deleteMany({ email: /@customers\.test$/ });
    [riya, dev] = await Customer.create([
      {
        name: 'Riya Sharma',
        email: 'riya@customers.test',
        phone: '+91 98765 43210',
        firebaseUid: 'g-riya',
        addresses: [{
          firstName: 'Riya', lastName: 'Sharma', phone: '9876543210', street: 'Khushahal Nagar', city: 'Varanasi', postalCode: '221003',
        }],
      },
      { name: 'Dev Patel', email: 'dev@customers.test', phone: '9123456780' },
    ]);
    await Order.create([
      order(riya, { status: 'paid' }),
      order(riya, { status: 'delivered', total: 1198 }),
      order(riya, { status: 'cancelled' }),
      order(dev, {
        status: 'pending',
        items: [{
          name: 'Cachehit Tee', size: 'M', color: 'White', sku: 'CACHEHIT-WHITE-M', price: 599, qty: 1,
        }],
      }),
    ]);
  });

  after(async () => {
    agent.close();
    await Order.deleteMany({ shippingEmail: /@customers\.test$/ });
    await Customer.deleteMany({ email: /@customers\.test$/ });
    await Admin.deleteMany({ email: 'cust-admin@customers.test' });
  });

  it('lists customers with order counts and spend, and searches name, email, phone and address', async () => {
    const all = await agent.get('/admin/customers?q=customers.test');
    const r = all.body.find((c) => c.email === 'riya@customers.test');
    expect(r).to.include({
      orders: 3, purchasedOrders: 2, totalSpent: 1797, authMethod: 'google',
    });

    const find = async (q) => (await agent.get(`/admin/customers?q=${encodeURIComponent(q)}`)).body.map((c) => c.email);
    expect(await find('riya')).to.deep.equal(['riya@customers.test']);
    expect(await find('9876543210')).to.include('riya@customers.test'); // "+91 98765 43210" stored with spaces
    expect(await find('221003')).to.include('riya@customers.test');
    expect(await find('dev@customers')).to.deep.equal(['dev@customers.test']);
  });

  it('shows one customer with addresses and every order', async () => {
    const res = await agent.get(`/admin/customers/${riya.id}`);
    expect(res.status).to.equal(200);
    expect(res.body.addresses).to.have.length(1);
    expect(res.body.orders).to.have.length(3);
    expect(res.body.orders[0].items[0]).to.include({ name: 'Gitblame Tee', color: 'Black' });
    expect((await agent.get('/admin/customers/000000000000000000000000')).status).to.equal(404);
  });

  it('searches orders by product, colour, email, phone and status', async () => {
    const refs = async (qs) => (await agent.get(`/admin/orders?limit=100&${qs}`)).body
      .filter((o) => (o.email || '').endsWith('@customers.test'));
    expect(await refs('q=cachehit')).to.have.length(1);
    expect(await refs('q=riya%20black')).to.have.length(3);
    expect(await refs('q=dev%40customers.test')).to.have.length(1);
    expect(await refs('q=9123456780')).to.have.length(1);
    expect(await refs('q=riya&status=delivered')).to.have.length(1);
    const one = (await refs('q=cachehit'))[0];
    expect(one).to.include({ email: 'dev@customers.test', phone: '9123456780', customerId: dev.id });
  });
});
