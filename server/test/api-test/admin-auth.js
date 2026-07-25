const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../server');
const { Admin } = require('../../database/models');
const password = require('../../utils/password');

chai.use(chaiHttp);
const { expect } = chai;

describe('Admin auth', () => {
  const email = 'admin-auth-test@sunobro.com';
  const plainPassword = 'SuperSecret123!';

  before(async () => {
    await Admin.deleteOne({ email });
    await Admin.create({
      name: 'Test Admin',
      email,
      passwordHash: await password.hash(plainPassword),
      role: 'admin',
    });
  });

  after(async () => {
    await Admin.deleteOne({ email });
  });

  it('rejects a wrong password with 401', async () => {
    const res = await chai.request(app)
      .post('/admin/auth/login')
      .send({ email, password: 'wrong-password' });
    expect(res.status).to.equal(401);
  });

  it('logs in with correct credentials, sets a session cookie, and allows /admin/auth/me', async () => {
    const agent = chai.request.agent(app);
    const loginRes = await agent.post('/admin/auth/login').send({ email, password: plainPassword });
    expect(loginRes.status).to.equal(200);
    expect(loginRes.body.admin.email).to.equal(email);

    const meRes = await agent.get('/admin/auth/me');
    expect(meRes.status).to.equal(200);
    expect(meRes.body.email).to.equal(email);

    agent.close();
  });

  it('rejects /admin/stats without a session', async () => {
    const res = await chai.request(app).get('/admin/stats');
    expect(res.status).to.equal(401);
  });
});
