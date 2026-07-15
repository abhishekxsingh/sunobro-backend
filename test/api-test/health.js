const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../server');
const { VERSION, NAME } = require('../../config');

chai.use(chaiHttp);
const { expect } = chai;

describe('GET /ping', () => {
  it('returns 200 with status ok', async () => {
    const res = await chai.request(app).get('/ping');
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ status: 'ok', version: VERSION, name: NAME });
  });
});
