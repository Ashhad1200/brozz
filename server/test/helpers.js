process.env.NODE_ENV = 'test';

const fs = require('fs/promises');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const config = require('../src/config');
const { pool, query } = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');
const { seedProducts } = require('../src/db/seed');
const { createApp } = require('../src/app');

const app = createApp();
const api = () => request(app);

const PASSWORD = 'Secret123!';

// Wipes the test database and re-seeds the demo catalog.
const resetDb = async () => {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await fs.rm(config.uploadDir, { recursive: true, force: true });
  await seedProducts();
};

const guest = async () => {
  const res = await api().post('/api/auth/guest').expect(201);
  return res.body.token;
};

let counter = 0;
const signup = async (token, overrides = {}) => {
  counter += 1;
  const req = api().post('/api/auth/signup');
  if (token) req.set('Authorization', `Bearer ${token}`);
  const res = await req
    .send({
      name: 'Test',
      lastName: 'User',
      email: `user${counter}-${Date.now()}@example.com`,
      password: PASSWORD,
      ...overrides,
    })
    .expect(201);
  return res.body;
};

const createAdmin = async () => {
  const email = `admin-${Date.now()}-${counter++}@example.com`;
  await query(
    `INSERT INTO users (email, password_hash, name, last_name, is_admin)
     VALUES ($1, $2, 'Ada', 'Admin', TRUE)`,
    [email, await bcrypt.hash(PASSWORD, 4)]
  );
  const res = await api()
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.token;
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// First card of a collection, with a size that has stock.
const findSku = async (predicate = (sku) => sku.quantity > 0) => {
  const res = await api().get('/api/products?collection=products&limit=100');
  for (const card of res.body.items) {
    const sku = card.skus.find(predicate);
    if (sku) return { card, sku };
  }
  throw new Error('No matching SKU in catalog');
};

const setStock = (skuId, quantity) =>
  query('UPDATE skus SET quantity = $2 WHERE id = $1', [skuId, quantity]);

const getStock = async (skuId) =>
  (await query('SELECT quantity FROM skus WHERE id = $1', [skuId])).rows[0]
    .quantity;

const addAddress = async (token, overrides = {}) => {
  const res = await api()
    .post('/api/account/addresses')
    .set(auth(token))
    .send({
      name: 'Jane',
      lastName: 'Doe',
      phoneNumber: '555-0100',
      address: '1 Main St',
      zipCode: '10001',
      city: 'New York',
      state: 'NY',
      ...overrides,
    })
    .expect(201);
  return res.body;
};

const VALID_CARD = {
  cardNumber: '4242 4242 4242 4242',
  name: 'Jane Doe',
  expiryDate: '12/99',
  securityCode: '123',
};

module.exports = {
  api,
  auth,
  pool,
  query,
  resetDb,
  guest,
  signup,
  createAdmin,
  findSku,
  setStock,
  getStock,
  addAddress,
  PASSWORD,
  VALID_CARD,
};
