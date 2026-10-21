const express = require('express');

const { query, withTransaction } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, conflict, notFound } = require('../lib/errors');
const { requireUuid } = require('../lib/validate');
const { getCart, reconcileCart } = require('../services/cart');

const router = express.Router();

router.use(requireAuth);

// Locks the SKU row so concurrent adds can't oversell, and reads the cart line.
const lockSkuAndLine = async (client, userId, skuId) => {
  const { rows: skuRows } = await client.query(
    'SELECT id, size, quantity FROM skus WHERE id = $1 FOR UPDATE',
    [skuId]
  );
  if (skuRows.length === 0) throw notFound('Product not found');

  const { rows: lineRows } = await client.query(
    'SELECT quantity FROM cart_items WHERE user_id = $1 AND sku_id = $2',
    [userId, skuId]
  );

  return { sku: skuRows[0], inCart: lineRows[0]?.quantity || 0 };
};

const setLine = (client, userId, skuId, quantity) =>
  quantity > 0
    ? client.query(
        `INSERT INTO cart_items (user_id, sku_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, sku_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [userId, skuId, quantity]
      )
    : client.query(
        'DELETE FROM cart_items WHERE user_id = $1 AND sku_id = $2',
        [userId, skuId]
      );

// Sends the cart, plus a warning when stock forced a change the user should see.
const sendCart = async (res, userId, warning = null) => {
  res.json({ items: await getCart(userId), warning });
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { changed } = await withTransaction((client) =>
      reconcileCart(req.user.id, client)
    );
    await sendCart(
      res,
      req.user.id,
      changed ? 'Item quantities in cart have been updated!' : null
    );
  })
);

router.post(
  '/check',
  asyncHandler(async (req, res) => {
    const { changed } = await withTransaction((client) =>
      reconcileCart(req.user.id, client)
    );
    await sendCart(
      res,
      req.user.id,
      changed
        ? 'Available stock is limited. Quantities in cart have been updated!'
        : null
    );
  })
);

router.post(
  '/items',
  asyncHandler(async (req, res) => {
    const skuId = requireUuid(req.body.skuId, 'skuId');

    const warning = await withTransaction(async (client) => {
      const { sku, inCart } = await lockSkuAndLine(client, req.user.id, skuId);

      if (sku.quantity <= 0) {
        if (inCart === 0) {
          throw conflict(`Size ${sku.size.toUpperCase()} is out of stock!`);
        }
        await setLine(client, req.user.id, skuId, 0);
        return 'This item is out of stock. Cart was updated!';
      }
      if (inCart > sku.quantity) {
        await setLine(client, req.user.id, skuId, sku.quantity);
        return 'Stock is limited. Item quantity in cart updated!';
      }
      if (inCart === sku.quantity) {
        throw conflict('All available stock is currently in cart!');
      }

      await setLine(client, req.user.id, skuId, inCart + 1);
      return null;
    });

    await sendCart(res, req.user.id, warning);
  })
);

router.post(
  '/items/:skuId/decrement',
  asyncHandler(async (req, res) => {
    const skuId = requireUuid(req.params.skuId, 'skuId');

    const warning = await withTransaction(async (client) => {
      const { sku, inCart } = await lockSkuAndLine(client, req.user.id, skuId);
      if (inCart === 0) throw notFound('Item is not in cart');

      if (inCart === 1) {
        await setLine(client, req.user.id, skuId, 0);
        return null;
      }
      if (sku.quantity <= 0) {
        await setLine(client, req.user.id, skuId, 0);
        return 'This item is out of stock and was removed from cart!';
      }
      if (sku.quantity < inCart) {
        await setLine(client, req.user.id, skuId, sku.quantity);
        return 'Stock is limited. Item quantity in cart updated!';
      }

      await setLine(client, req.user.id, skuId, inCart - 1);
      return null;
    });

    await sendCart(res, req.user.id, warning);
  })
);

router.delete(
  '/items/:skuId',
  asyncHandler(async (req, res) => {
    const skuId = requireUuid(req.params.skuId, 'skuId');
    await query('DELETE FROM cart_items WHERE user_id = $1 AND sku_id = $2', [
      req.user.id,
      skuId,
    ]);
    await sendCart(res, req.user.id);
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    await sendCart(res, req.user.id);
  })
);

module.exports = router;
