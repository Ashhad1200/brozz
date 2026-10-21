const { prisma, toNumber } = require('../db/prisma');
const { colorSlug } = require('../lib/slug');

// Cart lines joined with their SKU, variant and product.
const getCartRows = (userId, db = prisma) =>
  db.cartItem.findMany({
    where: { userId },
    orderBy: [{ addedAt: 'asc' }, { skuId: 'asc' }],
    include: { sku: { include: { variant: true, product: true } } },
  });

const formatItem = ({ skuId, quantity, sku }) => ({
  skuId,
  productId: sku.productId,
  variantId: sku.variantId,
  quantity,
  size: sku.size,
  model: sku.product.model,
  type: sku.product.type,
  color: sku.variant.color,
  price: toNumber(sku.variant.price),
  slug: `${sku.product.slug}-${colorSlug(sku.variant.color)}`,
  image: sku.variant.images[0]?.src || '',
});

const getCart = async (userId, db = prisma) =>
  (await getCartRows(userId, db)).map(formatItem);

const cartKey = (userId, skuId) => ({ userId_skuId: { userId, skuId } });

// Trims cart quantities down to available stock. Returns whether anything changed.
const reconcileCart = async (userId, db = prisma) => {
  const rows = await getCartRows(userId, db);
  let changed = false;

  for (const row of rows) {
    if (row.sku.quantity <= 0) {
      changed = true;
      await db.cartItem.delete({ where: cartKey(userId, row.skuId) });
    } else if (row.quantity > row.sku.quantity) {
      changed = true;
      await db.cartItem.update({
        where: cartKey(userId, row.skuId),
        data: { quantity: row.sku.quantity },
      });
    }
  }

  return { items: await getCart(userId, db), changed };
};

// Moves a guest cart into an account cart. Callers reconcile afterwards to cap
// merged quantities at available stock.
const mergeCarts = async (fromUserId, toUserId, db) => {
  const guestItems = await db.cartItem.findMany({ where: { userId: fromUserId } });

  for (const item of guestItems) {
    await db.cartItem.upsert({
      where: cartKey(toUserId, item.skuId),
      create: {
        userId: toUserId,
        skuId: item.skuId,
        quantity: item.quantity,
        addedAt: item.addedAt,
      },
      update: { quantity: { increment: item.quantity } },
    });
  }

  await db.cartItem.deleteMany({ where: { userId: fromUserId } });
};

module.exports = { getCart, getCartRows, reconcileCart, mergeCarts, cartKey };
