const assert = require('assert');
const fs = require('fs');
const path = require('path');

const testDb = path.join(__dirname, '../data/auth-cors-test.db');
for (const suffix of ['', '-wal', '-shm', '.pre-round2-backup']) { try { fs.rmSync(`${testDb}${suffix}`); } catch {} }
process.env.DATABASE_PATH = './data/auth-cors-test.db';
process.env.CORS_ORIGINS = 'http://localhost:5173,http://192.168.1.50:5173';
require('../src/db/init');
const app = require('../src/app');
const server = app.listen(0);
const address = server.address();
const url = `http://127.0.0.1:${address.port}`;

async function main() {
  const login = async (body, origin) => fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  let response = await login({ email: 'officer@legalmetrix.local', password: 'Officer@123', application: 'MOBILE' });
  assert.equal(response.status, 200, 'Field Officer MOBILE login must succeed');
  response = await login({ email: 'admin@legalmetrix.local', password: 'Admin@123', application: 'WEB' }, 'http://localhost:5173');
  assert.equal(response.status, 200, 'Admin WEB login must succeed');
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  response = await login({ email: 'officer@legalmetrix.local', password: 'Officer@123', application: 'WEB' });
  assert.equal(response.status, 403, 'Field Officer WEB login must be denied');
  response = await login({ email: 'admin@legalmetrix.local', password: 'Admin@123', application: 'WEB' }, 'https://untrusted.example');
  assert.equal(response.status, 500, 'Unknown browser Origin must be rejected by CORS');
  console.log('Authentication application-context and CORS tests passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
