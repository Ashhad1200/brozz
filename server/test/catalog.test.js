const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const h = require('./helpers');

before(h.resetDb);
after(() => h.pool.end());

test('lists every variant as a card with pagination', async () => {
  const first = await h.api().get('/api/products?limit=4').expect(200);
  assert.equal(first.body.total, 6); // 5 products, the hoodie has 2 colors
  assert.equal(first.body.items.length, 4);
  assert.equal(first.body.hasMore, true);

  const second = await h.api().get('/api/products?limit=4&offset=4').expect(200);
  assert.equal(second.body.items.length, 2);
  assert.equal(second.body.hasMore, false);

  const ids = [...first.body.items, ...second.body.items].map((c) => c.id);
  assert.equal(new Set(ids).size, 6);
});

test('cards carry everything the product grid renders', async () => {
  const res = await h.api().get('/api/products?collection=hoodies-sweatshirts').expect(200);
  const hoodie = res.body.items.find((c) => c.type === 'hoodie' && c.color === 'negro');

  assert.equal(hoodie.price, 45);
  assert.equal(hoodie.actualPrice, 55);
  assert.equal(hoodie.discount, 20);
  assert.equal(hoodie.numberOfVariants, 2);
  assert.equal(hoodie.allVariants.length, 2);
  assert.equal(hoodie.slides[0].url, 'de-gira-hoodie-negro');
  assert.match(hoodie.slides[0].src, /^\/uploads\//);
  assert.deepEqual(hoodie.sizes, ['s', 'm', 'l', 'xl', 'xxl']);
  assert.equal(hoodie.availableQuantity.m, 8);
  assert.equal(hoodie.isSoldOut, false);
});

test('filters by collection and sorts by price', async () => {
  const tees = await h.api().get('/api/products?collection=t-shirts').expect(200);
  assert.ok(tees.body.items.every((c) => c.collection === 't-shirts'));

  const desc = await h.api().get('/api/products?sort=price&direction=desc&limit=100').expect(200);
  const prices = desc.body.items.map((c) => c.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => b - a));

  await h.api().get('/api/products?collection=nope').expect(400);
});

test('resolves product slugs including the color', async () => {
  const res = await h.api().get('/api/products/slug/de-gira-hoodie-blanco').expect(200);
  const { product, variantId } = res.body;
  assert.equal(product.variants.length, 2);
  const selected = product.variants.find((v) => v.variantId === variantId);
  assert.equal(selected.color, 'blanco');
  assert.equal(selected.sizes[0].value, 's');

  await h.api().get('/api/products/slug/de-gira-hoodie-purple').expect(404);
  await h.api().get('/api/products/slug/missing-product-negro').expect(404);
});

test('static uploads are served', async () => {
  const res = await h.api().get('/api/products?limit=1').expect(200);
  await h.api().get(res.body.items[0].slides[0].src).expect(200).expect('Content-Type', /image/);
});

test('newsletter signup is idempotent', async () => {
  const first = await h.api().post('/api/newsletter').send({ email: 'news@example.com' }).expect(201);
  assert.equal(first.body.message, 'Thanks for joining!');
  const again = await h.api().post('/api/newsletter').send({ email: 'NEWS@example.com' }).expect(200);
  assert.equal(again.body.message, 'You have already joined!');
  await h.api().post('/api/newsletter').send({ email: 'bad' }).expect(400);
});
