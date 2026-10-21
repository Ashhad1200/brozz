const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const h = require('./helpers');
const config = require('../src/config');

before(h.resetDb);
after(() => h.pool.end());

const IMAGE = path.join(__dirname, '..', 'seed-images', 'productos-remera-ojos-negra-1.jpg');

const upload = async (token) => {
  const res = await h.api().post('/api/admin/uploads').set(h.auth(token))
    .attach('images', IMAGE)
    .expect(201);
  return res.body.images;
};

const productBody = (images, overrides = {}) => ({
  product: {
    model: 'Test Model',
    type: 'Tee',
    collection: 't-shirts',
    description: 'A   test product',
    sku: 'tst',
    sizes: ['s', 'm'],
    tags: [{ content: 'Fresh' }],
    ...overrides,
  },
  images,
  variants: [
    {
      id: 'client-generated-id',
      color: 'Light Blue',
      colorDisplay: '',
      currentPrice: 10,
      actualPrice: 20,
      inventory: { s: 3, m: 0 },
      images,
    },
  ],
});

test('admin routes are closed to guests and customers', async () => {
  await h.api().post('/api/admin/products').send({}).expect(401);
  const { token } = await h.signup();
  await h.api().post('/api/admin/products').set(h.auth(token)).send({}).expect(403);
  await h.api().post('/api/admin/uploads').set(h.auth(token)).attach('images', IMAGE).expect(403);
});

test('admin creates a product that shows up in the storefront', async () => {
  const token = await h.createAdmin();
  const images = await upload(token);
  assert.match(images[0].src, /^\/uploads\/[0-9a-f-]+\.jpg$/);
  assert.ok(fs.existsSync(path.join(config.uploadDir, path.basename(images[0].src))));

  const res = await h.api().post('/api/admin/products').set(h.auth(token))
    .send(productBody(images))
    .expect(201);
  const { product } = res.body;
  assert.equal(product.model, 'test model');
  assert.equal(product.description, 'A test product');
  assert.equal(product.baseSku, 'TST');
  assert.deepEqual(product.sizesInput, { s: true, m: true, l: false, xl: false, xxl: false });
  assert.deepEqual(product.variants[0].inventory, { s: 3, m: 0 });

  const page = await h.api().get('/api/products/slug/test-model-tee-lightblue').expect(200);
  const variant = page.body.product.variants[0];
  assert.equal(variant.variantPrice, 10);
  assert.deepEqual(variant.sizes.map((s) => [s.value, s.quantity]), [['s', 3], ['m', 0]]);
});

test('editing keeps SKU ids stable and removes dropped sizes', async () => {
  const token = await h.createAdmin();
  const images = await upload(token);
  const created = await h.api().post('/api/admin/products').set(h.auth(token))
    .send(productBody(images, { model: 'Stable', sku: 'stb' }))
    .expect(201);
  const productId = created.body.product.id;

  const before = (await h.api().get('/api/products/slug/stable-tee-lightblue')).body.product;
  const sSkuId = before.variants[0].sizes.find((s) => s.value === 's').skuId;

  const body = productBody(images, { model: 'Stable', sku: 'stb', sizes: ['s'] });
  body.variants[0].id = created.body.product.variants[0].id;
  body.variants[0].inventory = { s: 9 };
  await h.api().put(`/api/admin/products/${productId}`).set(h.auth(token)).send(body).expect(200);

  const after = (await h.api().get('/api/products/slug/stable-tee-lightblue')).body.product;
  assert.deepEqual(after.variants[0].sizes, [{ skuId: sSkuId, value: 's', quantity: 9 }]);
});

test('validates product input', async () => {
  const token = await h.createAdmin();
  const images = await upload(token);

  const badPrice = productBody(images);
  badPrice.variants[0].currentPrice = 50;
  await h.api().post('/api/admin/products').set(h.auth(token)).send(badPrice).expect(400);

  const noImages = productBody(images);
  noImages.variants[0].images = [];
  await h.api().post('/api/admin/products').set(h.auth(token)).send(noImages).expect(400);

  await h.api().post('/api/admin/products').set(h.auth(token))
    .send(productBody(images, { collection: 'shoes' }))
    .expect(400);
  await h.api().post('/api/admin/products').set(h.auth(token))
    .send(productBody(images, { sizes: [] }))
    .expect(400);
});

test('deleting the last variant deletes the product and its unused uploads', async () => {
  const token = await h.createAdmin();
  const images = await upload(token);
  const file = path.join(config.uploadDir, path.basename(images[0].src));

  const created = await h.api().post('/api/admin/products').set(h.auth(token))
    .send(productBody(images, { model: 'Doomed', sku: 'dmd' }))
    .expect(201);
  const { id, variants } = created.body.product;

  const res = await h.api().delete(`/api/admin/products/${id}/variants/${variants[0].id}`)
    .set(h.auth(token))
    .expect(200);
  assert.equal(res.body.productDeleted, true);
  await h.api().get(`/api/admin/products/${id}`).set(h.auth(token)).expect(404);
  assert.equal(fs.existsSync(file), false);
});

test('a SKU clash with another product is reported clearly', async () => {
  const token = await h.createAdmin();
  const images = await upload(token);
  await h.api().post('/api/admin/products').set(h.auth(token))
    .send(productBody(images, { model: 'First', sku: 'dup' }))
    .expect(201);

  const res = await h.api().post('/api/admin/products').set(h.auth(token))
    .send(productBody(images, { model: 'Second', sku: 'dup' }))
    .expect(409);
  assert.match(res.body.message, /SKU DUP-LBL-SM is already used/);
});

test('rejects non-image uploads', async () => {
  const token = await h.createAdmin();
  await h.api().post('/api/admin/uploads').set(h.auth(token))
    .attach('images', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' })
    .expect(400);
});

test('seeding is a no-op when the catalog has products', async () => {
  const token = await h.createAdmin();
  const res = await h.api().post('/api/admin/seed').set(h.auth(token)).expect(200);
  assert.equal(res.body.seeded, 0);
});
