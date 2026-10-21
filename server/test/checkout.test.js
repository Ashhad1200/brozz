const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const h = require('./helpers');

before(h.resetDb);
after(() => h.pool.end());

test('first address becomes main; a new main address moves to the top', async () => {
  const { token } = await h.signup();

  const first = await h.addAddress(token, { address: '1 First St' });
  assert.equal(first.address.isMain, true);
  assert.equal(first.address.displayOrder, 1);

  const second = await h.addAddress(token, { address: '2 Second St' });
  assert.equal(second.address.isMain, false);

  const third = await h.addAddress(token, { address: '3 Third St', isMain: true });
  assert.deepEqual(
    third.addresses.map((a) => [a.address, a.isMain, a.displayOrder]),
    [
      ['3 Third St', true, 1],
      ['1 First St', false, 2],
      ['2 Second St', false, 3],
    ]
  );
  assert.match(third.address.label, /Jane Doe - 3 Third St - New York, NY 10001/);
});

test('editing and deleting addresses keeps exactly one main address', async () => {
  const { token } = await h.signup();
  const { address: main } = await h.addAddress(token, { address: 'Main' });
  const { address: other } = await h.addAddress(token, { address: 'Other' });

  const edited = await h.api().put(`/api/account/addresses/${other.id}`).set(h.auth(token))
    .send({ ...other, address: 'Other Edited', isMain: false })
    .expect(200);
  assert.equal(edited.body.addresses.find((a) => a.id === other.id).address, 'Other Edited');

  const deleted = await h.api().delete(`/api/account/addresses/${main.id}`).set(h.auth(token)).expect(200);
  assert.equal(deleted.body.addresses.length, 1);
  assert.equal(deleted.body.addresses[0].isMain, true);
});

test("users can't touch each other's addresses", async () => {
  const { token: owner } = await h.signup();
  const { token: intruder } = await h.signup();
  const { address } = await h.addAddress(owner);

  await h.api().delete(`/api/account/addresses/${address.id}`).set(h.auth(intruder)).expect(404);
  await h.api().put('/api/checkout/shipping-info').set(h.auth(intruder))
    .send({ email: 'x@example.com', shippingAddressId: address.id })
    .expect(404);
});

const prepareCheckout = async (option = 'expedited') => {
  const { token } = await h.signup();
  const { address } = await h.addAddress(token);
  const { card, sku } = await h.findSku((s) => s.quantity >= 2);

  await h.api().post('/api/cart/items').set(h.auth(token)).send({ skuId: sku.skuId }).expect(200);
  await h.api().post('/api/cart/items').set(h.auth(token)).send({ skuId: sku.skuId }).expect(200);

  await h.api().get('/api/checkout').set(h.auth(token)).expect(200);
  await h.api().put('/api/checkout/shipping-info').set(h.auth(token))
    .send({ email: 'buyer@example.com', shippingAddressId: address.id })
    .expect(200);
  const shipping = await h.api().put('/api/checkout/shipping-option').set(h.auth(token))
    .send({ option })
    .expect(200);

  return { token, address, card, sku, shipping: shipping.body };
};

test('placing an order snapshots the cart, charges server-side shipping and decrements stock', async () => {
  const { token, card, sku, shipping } = await prepareCheckout('expedited');
  assert.equal(shipping.shippingCost, 15);
  const before = await h.getStock(sku.skuId);

  const res = await h.api().post('/api/orders').set(h.auth(token))
    .send({ payment: h.VALID_CARD, billingAddress: {} })
    .expect(201);
  const { order } = res.body;

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.subtotal, card.price * 2);
  assert.equal(order.total, card.price * 2 + 15);
  assert.equal(order.email, 'buyer@example.com');
  assert.equal(order.shippingAddress.city, 'New York');
  assert.deepEqual(order.paymentInfo, { name: 'Jane Doe', last4: '4242' });
  assert.equal(order.status, 'pending');

  assert.equal(await h.getStock(sku.skuId), before - 2);

  const cart = await h.api().get('/api/cart').set(h.auth(token)).expect(200);
  assert.equal(cart.body.items.length, 0);

  const orders = await h.api().get('/api/orders').set(h.auth(token)).expect(200);
  assert.equal(orders.body.orders.length, 1);
  assert.equal(orders.body.orders[0].id, order.id);

  // The card number and CVV are never persisted.
  const { rows } = await h.query('SELECT payment_info::text AS p FROM orders WHERE id = $1', [order.id]);
  assert.doesNotMatch(rows[0].p, /4242 4242|123"/);
});

test('rejects invalid or expired cards without touching stock', async () => {
  const { token, sku } = await prepareCheckout('standard');
  const before = await h.getStock(sku.skuId);

  await h.api().post('/api/orders').set(h.auth(token))
    .send({ payment: { ...h.VALID_CARD, expiryDate: '01/20' } })
    .expect(400);
  await h.api().post('/api/orders').set(h.auth(token))
    .send({ payment: { ...h.VALID_CARD, cardNumber: '123' } })
    .expect(400);

  assert.equal(await h.getStock(sku.skuId), before);
});

test('an order that would oversell is refused and the cart is trimmed', async () => {
  const { token, sku } = await prepareCheckout('standard');
  const original = await h.getStock(sku.skuId);
  await h.setStock(sku.skuId, 1);

  const res = await h.api().post('/api/orders').set(h.auth(token))
    .send({ payment: h.VALID_CARD })
    .expect(409);
  assert.match(res.body.message, /stock is limited/i);
  assert.equal(res.body.items[0].quantity, 1);
  assert.equal(await h.getStock(sku.skuId), 1);

  await h.setStock(sku.skuId, original);
});

test('checkout requires an account, an address and a shipping option', async () => {
  const guestToken = await h.guest();
  await h.api().get('/api/checkout').set(h.auth(guestToken)).expect(401);
  await h.api().post('/api/orders').set(h.auth(guestToken)).send({ payment: h.VALID_CARD }).expect(401);

  const { token } = await h.signup();
  const noAddress = await h.api().post('/api/orders').set(h.auth(token))
    .send({ payment: h.VALID_CARD })
    .expect(400);
  assert.match(noAddress.body.message, /shipping address/);

  await h.api().put('/api/checkout/shipping-option').set(h.auth(token))
    .send({ option: 'teleport' })
    .expect(400);
});
