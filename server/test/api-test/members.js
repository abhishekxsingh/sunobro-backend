const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../server');
const { Admin } = require('../../database/models');
const password = require('../../utils/password');

chai.use(chaiHttp);
const { expect } = chai;

const OWNER = { email: 'owner@members.test', password: 'owner-password-123' };

describe('Team members', function teamMembers() {
  this.timeout(20000);
  let owner;

  const login = async (email, pass) => {
    const agent = chai.request.agent(app);
    const res = await agent.post('/admin/auth/login').send({ email, password: pass });
    return { agent, status: res.status };
  };

  beforeEach(async () => {
    await Admin.deleteMany({ email: /@members\.test$/ });
    await Admin.create({
      name: 'Owner', email: OWNER.email, role: 'admin', passwordHash: await password.hash(OWNER.password),
    });
    owner = (await login(OWNER.email, OWNER.password)).agent;
  });

  afterEach(async () => {
    owner.close();
    await Admin.deleteMany({ email: /@members\.test$/ });
  });

  it('adds a member with a one-time password they can sign in with', async () => {
    const res = await owner.post('/admin/members').send({ name: 'Riya Ops', email: 'Riya@Members.test', role: 'ops' });
    expect(res.status).to.equal(201);
    expect(res.body.member).to.include({ email: 'riya@members.test', role: 'ops', active: true });
    expect(res.body.temporaryPassword).to.match(/^[\w]{4}-[\w]{4}-[\w]{4}-[\w]{4}$/);

    const riya = await login('riya@members.test', res.body.temporaryPassword);
    expect(riya.status).to.equal(200);
    const list = await owner.get('/admin/members');
    const found = list.body.find((m) => m.email === 'riya@members.test');
    expect(found.lastLoginAt).to.be.a('string');
    expect(list.body.find((m) => m.email === OWNER.email).isYou).to.equal(true);
    riya.agent.close();

    const dup = await owner.post('/admin/members').send({ name: 'Again', email: 'riya@members.test', role: 'ops' });
    expect(dup.status).to.equal(409);

    const chosen = await owner.post('/admin/members').send({
      name: 'Dev', email: 'dev@members.test', role: 'admin', password: 'chosen-password-1',
    });
    expect(chosen.body.temporaryPassword).to.equal(null);
    const short = await owner.post('/admin/members').send({
      name: 'X', email: 'x@members.test', role: 'ops', password: 'short',
    });
    expect(short.status).to.equal(400);
  });

  it('keeps team management to the admin role', async () => {
    const { body } = await owner.post('/admin/members').send({ name: 'Ops', email: 'ops@members.test', role: 'ops' });
    const ops = await login('ops@members.test', body.temporaryPassword);
    expect((await ops.agent.get('/admin/members')).status).to.equal(403);
    expect((await ops.agent.get('/admin/orders')).status).to.equal(200);

    // Promotion applies to the open session straight away.
    await owner.put(`/admin/members/${body.member.id}`).send({ role: 'admin' });
    expect((await ops.agent.get('/admin/members')).status).to.equal(200);
    ops.agent.close();
  });

  it('signs out deactivated and removed members at once', async () => {
    const { body } = await owner.post('/admin/members').send({ name: 'Temp', email: 'temp@members.test', role: 'ops' });
    const temp = await login('temp@members.test', body.temporaryPassword);
    expect((await temp.agent.get('/admin/auth/me')).status).to.equal(200);

    await owner.put(`/admin/members/${body.member.id}`).send({ active: false });
    expect((await temp.agent.get('/admin/auth/me')).status).to.equal(401);
    expect((await login('temp@members.test', body.temporaryPassword)).status).to.equal(401);

    await owner.put(`/admin/members/${body.member.id}`).send({ active: true });
    const reset = await owner.post(`/admin/members/${body.member.id}/reset-password`);
    expect((await login('temp@members.test', body.temporaryPassword)).status).to.equal(401);
    expect((await login('temp@members.test', reset.body.temporaryPassword)).status).to.equal(200);

    expect((await owner.delete(`/admin/members/${body.member.id}`)).status).to.equal(204);
    expect((await temp.agent.get('/admin/auth/me')).status).to.equal(401);
    temp.agent.close();
  });

  it('never leaves the team without an active admin, and protects your own account', async () => {
    const me = (await owner.get('/admin/members')).body.find((m) => m.isYou);
    expect((await owner.put(`/admin/members/${me.id}`).send({ active: false })).status).to.equal(409);
    expect((await owner.put(`/admin/members/${me.id}`).send({ role: 'ops' })).status).to.equal(409);
    expect((await owner.delete(`/admin/members/${me.id}`)).status).to.equal(409);
    expect((await owner.post(`/admin/members/${me.id}/reset-password`)).status).to.equal(409);
    expect((await owner.put(`/admin/members/${me.id}`).send({ name: 'Owner Renamed' })).body.name).to.equal('Owner Renamed');

    // With other admins only counting when active.
    const other = await Admin.create({
      name: 'Off', email: 'off@members.test', role: 'admin', active: false, passwordHash: 'x',
    });
    const ownerDoc = await Admin.findOne({ email: OWNER.email });
    const second = await Admin.create({
      name: 'Second', email: 'second@members.test', role: 'admin', passwordHash: await password.hash('second-password-1'),
    });
    const secondAgent = (await login('second@members.test', 'second-password-1')).agent;
    expect((await secondAgent.put(`/admin/members/${ownerDoc.id}`).send({ role: 'ops' })).status).to.equal(200);
    // Now `second` is the only active admin: the owner (ops) can't demote… and second can't remove itself.
    expect((await secondAgent.delete(`/admin/members/${second.id}`)).status).to.equal(409);
    expect((await secondAgent.put(`/admin/members/${other.id}`).send({ role: 'ops' })).status).to.equal(200);
    secondAgent.close();
  });
});
