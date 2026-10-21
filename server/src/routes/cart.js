const express = require('express');

const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, conflict, notFound } = require('../lib/errors');
const { requireUuid } = require('../lib/validate');
const { getCart, reconcileCart, cartKey } = require('../services/cart');

const router = express.Router();

router.use(requireAuth);

// Locks the SKU row so concurrent adds can't oversell, and reads the cart line.
const lockSkuAndLine = async (tx, userId, skuId) => {
  const [sku] = await tx.$queryRaw`
    SELECT id, size, quantity FROM skus WHERE id = ${skuId}::uuid FOR UPDATE`;
  if (!sku) throw notFound('Product not found');

  const line = await tx.cartItem.findUnique({ where: cartKey(userId, skuId) });
  return { sku, inCart: line?.quantity || 0 };
};

const setLine = (tx, userId, skuId, quantity) =>
  quantity > 0
    ? tx.cartItem.upsert({
        where: cartKey(userId, skuId),
        create: { userId, skuId, quantity },
        update: { quantity },
      })
    : tx.cartItem.deleteMany({ where: { userId, skuId } });

// Sends the cart, plus a warning when stock forced a change the user should see.
const sendCart = async (res, userId, warning = null) => {
  res.json({ items: await getCart(userId), warning });
};

const reconcile = (userId) =>
  prisma.$transaction((tx) => reconcileCart(userId, tx));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { changed } = await reconcile(req.user.id);
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
    const { changed } = await reconcile(req.user.id);
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

    const warning = await prisma.$transaction(async (tx) => {
      const { sku, inCart } = await lockSkuAndLine(tx, req.user.id, skuId);

      if (sku.quantity <= 0) {
        if (inCart === 0) {
          throw conflict(`Size ${sku.size.toUpperCase()} is out of stock!`);
        }
        await setLine(tx, req.user.id, skuId, 0);
        return 'This item is out of stock. Cart was updated!';
      }
      if (inCart > sku.quantity) {
        await setLine(tx, req.user.id, skuId, sku.quantity);
        return 'Stock is limited. Item quantity in cart updated!';
      }
      if (inCart === sku.quantity) {
        throw conflict('All available stock is currently in cart!');
      }

      await setLine(tx, req.user.id, skuId, inCart + 1);
      return null;
    });

    await sendCart(res, req.user.id, warning);
  })
);

router.post(
  '/items/:skuId/decrement',
  asyncHandler(async (req, res) => {
    const skuId = requireUuid(req.params.skuId, 'skuId');

    const warning = await prisma.$transaction(async (tx) => {
      const { sku, inCart } = await lockSkuAndLine(tx, req.user.id, skuId);
      if (inCart === 0) throw notFound('Item is not in cart');

      if (inCart === 1) {
        await setLine(tx, req.user.id, skuId, 0);
        return null;
      }
      if (sku.quantity <= 0) {
        await setLine(tx, req.user.id, skuId, 0);
        return 'This item is out of stock and was removed from cart!';
      }
      if (sku.quantity < inCart) {
        await setLine(tx, req.user.id, skuId, sku.quantity);
        return 'Stock is limited. Item quantity in cart updated!';
      }

      await setLine(tx, req.user.id, skuId, inCart - 1);
      return null;
    });

    await sendCart(res, req.user.id, warning);
  })
);

router.delete(
  '/items/:skuId',
  asyncHandler(async (req, res) => {
    const skuId = requireUuid(req.params.skuId, 'skuId');
    await prisma.cartItem.deleteMany({ where: { userId: req.user.id, skuId } });
    await sendCart(res, req.user.id);
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });
    await sendCart(res, req.user.id);
  })
);

module.exports = router;
