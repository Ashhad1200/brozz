process.env.NODE_ENV = 'test';

const { execSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const config = require('../src/config');
const { prisma } = require('../src/db/prisma');
const { seedProducts } = require('../src/db/seed');
const { createApp } = require('../src/app');

const app = createApp();
const api = () => request(app);

const PASSWORD = 'Secret123!';

// Rebuilds the test database from the Prisma migrations, then seeds the demo
// catalog. Runs before each test file; TEST_DATABASE_URL is wiped every time.
const resetDb = async () => {
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
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
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      name: 'Ada',
      lastName: 'Admin',
      isAdmin: true,
    },
  });
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
  prisma.sku.update({ where: { id: skuId }, data: { quantity } });

const getStock = async (skuId) =>
  (await prisma.sku.findUnique({ where: { id: skuId } })).quantity;

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
  prisma,
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
