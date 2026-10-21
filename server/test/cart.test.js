const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const h = require('./helpers');

before(h.resetDb);
after(() => h.prisma.$disconnect());

const add = (token, skuId) =>
  h.api().post('/api/cart/items').set(h.auth(token)).send({ skuId });

test('adds items with product details populated', async () => {
  const token = await h.guest();
  const { card, sku } = await h.findSku();

  const res = await add(token, sku.skuId).expect(200);
  const [item] = res.body.items;
  assert.equal(item.quantity, 1);
  assert.equal(item.model, card.model);
  assert.equal(item.price, card.price);
  assert.equal(item.slug, card.slides[0].url);
  assert.equal(res.body.warning, null);

  const again = await add(token, sku.skuId).expect(200);
  assert.equal(again.body.items[0].quantity, 2);
});

test('refuses to add beyond available stock', async () => {
  const token = await h.guest();
  const { sku } = await h.findSku();
  await h.setStock(sku.skuId, 1);

  await add(token, sku.skuId).expect(200);
  const res = await add(token, sku.skuId).expect(409);
  assert.equal(res.body.message, 'All available stock is currently in cart!');

  await h.setStock(sku.skuId, 0);
  const other = await h.guest();
  const out = await add(other, sku.skuId).expect(409);
  assert.match(out.body.message, /out of stock/);

  await h.setStock(sku.skuId, 5);
});

test('decrement, delete line and clear cart', async () => {
  const token = await h.guest();
  const { sku } = await h.findSku((s) => s.quantity >= 2);
  await add(token, sku.skuId).expect(200);
  await add(token, sku.skuId).expect(200);

  const dec = await h.api().post(`/api/cart/items/${sku.skuId}/decrement`).set(h.auth(token)).expect(200);
  assert.equal(dec.body.items[0].quantity, 1);

  const gone = await h.api().post(`/api/cart/items/${sku.skuId}/decrement`).set(h.auth(token)).expect(200);
  assert.equal(gone.body.items.length, 0);

  await add(token, sku.skuId).expect(200);
  const del = await h.api().delete(`/api/cart/items/${sku.skuId}`).set(h.auth(token)).expect(200);
  assert.equal(del.body.items.length, 0);

  await add(token, sku.skuId).expect(200);
  const cleared = await h.api().delete('/api/cart').set(h.auth(token)).expect(200);
  assert.equal(cleared.body.items.length, 0);
});

test('cart check trims quantities when stock drops', async () => {
  const token = await h.guest();
  const { sku } = await h.findSku((s) => s.quantity >= 3);
  await add(token, sku.skuId).expect(200);
  await add(token, sku.skuId).expect(200);
  await add(token, sku.skuId).expect(200);

  const original = await h.getStock(sku.skuId);
  await h.setStock(sku.skuId, 1);

  const res = await h.api().post('/api/cart/check').set(h.auth(token)).expect(200);
  assert.equal(res.body.items[0].quantity, 1);
  assert.match(res.body.warning, /stock is limited/i);

  const fine = await h.api().post('/api/cart/check').set(h.auth(token)).expect(200);
  assert.equal(fine.body.warning, null);

  await h.setStock(sku.skuId, original);
});

test('rejects malformed sku ids and requires a session', async () => {
  const token = await h.guest();
  await add(token, 'not-a-uuid').expect(400);
  await add(token, '00000000-0000-0000-0000-000000000000').expect(404);
  await h.api().get('/api/cart').expect(401);
});
