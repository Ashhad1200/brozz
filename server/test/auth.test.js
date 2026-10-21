const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const h = require('./helpers');

before(h.resetDb);
after(() => h.prisma.$disconnect());

test('guest session can read /me and is not verified', async () => {
  const token = await h.guest();
  const res = await h.api().get('/api/auth/me').set(h.auth(token)).expect(200);
  assert.equal(res.body.user.isAnonymous, true);
  assert.equal(res.body.user.isVerified, false);
});

test('requests without a valid token are rejected', async () => {
  await h.api().get('/api/auth/me').expect(401);
  await h.api().get('/api/auth/me').set(h.auth('not-a-token')).expect(401);
});

test('signup upgrades the guest in place and keeps their cart', async () => {
  const token = await h.guest();
  const { sku } = await h.findSku();
  await h.api().post('/api/cart/items').set(h.auth(token)).send({ skuId: sku.skuId }).expect(200);

  const { token: newToken, user } = await h.signup(token, { email: 'keep-cart@example.com' });
  assert.equal(user.isVerified, true);
  assert.equal(user.email, 'keep-cart@example.com');

  const cart = await h.api().get('/api/cart').set(h.auth(newToken)).expect(200);
  assert.equal(cart.body.items.length, 1);
  assert.equal(cart.body.items[0].skuId, sku.skuId);
});

test('signup rejects duplicate emails, weak passwords and bad emails', async () => {
  await h.signup(null, { email: 'dupe@example.com' });

  const dupe = await h.api().post('/api/auth/signup')
    .send({ name: 'A', lastName: 'B', email: 'DUPE@example.com', password: h.PASSWORD })
    .expect(409);
  assert.equal(dupe.body.message, 'User already exists!');

  await h.api().post('/api/auth/signup')
    .send({ name: 'A', lastName: 'B', email: 'weak@example.com', password: 'password' })
    .expect(400);
  await h.api().post('/api/auth/signup')
    .send({ name: 'A', lastName: 'B', email: 'nope', password: h.PASSWORD })
    .expect(400);
});

test('login checks the password and never stores it in plain text', async () => {
  await h.signup(null, { email: 'login@example.com' });

  const bad = await h.api().post('/api/auth/login')
    .send({ email: 'login@example.com', password: 'Wrong123!' })
    .expect(401);
  assert.equal(bad.body.message, 'User/password is incorrect!');

  const ok = await h.api().post('/api/auth/login')
    .send({ email: 'LOGIN@example.com', password: h.PASSWORD })
    .expect(200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.email, 'login@example.com');

  const stored = await h.prisma.user.findUnique({ where: { email: 'login@example.com' } });
  assert.notEqual(stored.passwordHash, h.PASSWORD);
});

test('login merges the guest cart into the account and removes the guest', async () => {
  const { token: accountToken } = await h.signup(null, { email: 'merge@example.com' });
  const { sku } = await h.findSku((s) => s.quantity >= 3);
  await h.api().post('/api/cart/items').set(h.auth(accountToken)).send({ skuId: sku.skuId }).expect(200);

  const guestToken = await h.guest();
  await h.api().post('/api/cart/items').set(h.auth(guestToken)).send({ skuId: sku.skuId }).expect(200);
  await h.api().post('/api/cart/items').set(h.auth(guestToken)).send({ skuId: sku.skuId }).expect(200);

  const login = await h.api().post('/api/auth/login').set(h.auth(guestToken))
    .send({ email: 'merge@example.com', password: h.PASSWORD })
    .expect(200);

  const cart = await h.api().get('/api/cart').set(h.auth(login.body.token)).expect(200);
  assert.equal(cart.body.items[0].quantity, 3);

  // The guest token's user no longer exists.
  await h.api().get('/api/auth/me').set(h.auth(guestToken)).expect(401);
});

test('password change requires the current password', async () => {
  const { token } = await h.signup(null, { email: 'pw@example.com' });

  await h.api().put('/api/auth/password').set(h.auth(token))
    .send({ currentPassword: 'Wrong123!', newPassword: 'Another123!' })
    .expect(401);
  await h.api().put('/api/auth/password').set(h.auth(token))
    .send({ currentPassword: h.PASSWORD, newPassword: 'Another123!' })
    .expect(204);
  await h.api().post('/api/auth/login')
    .send({ email: 'pw@example.com', password: 'Another123!' })
    .expect(200);
});

test('profile updates require an account', async () => {
  const guestToken = await h.guest();
  await h.api().patch('/api/account/profile').set(h.auth(guestToken))
    .send({ name: 'X', lastName: 'Y' })
    .expect(401);

  const { token } = await h.signup();
  const res = await h.api().patch('/api/account/profile').set(h.auth(token))
    .send({ name: '  Jane  ', lastName: 'Doe', phoneNumber: '555' })
    .expect(200);
  assert.equal(res.body.user.name, 'Jane');
  assert.equal(res.body.user.phoneNumber, '555');
});
