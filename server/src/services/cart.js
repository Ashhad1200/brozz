const { query } = require('../db/pool');
const { colorSlug } = require('../lib/slug');

const CART_SELECT = `
  SELECT ci.sku_id, ci.quantity, s.size, s.quantity AS stock,
         s.product_id, s.variant_id, v.color, v.price, v.images,
         p.model, p.type, p.slug
    FROM cart_items ci
    JOIN skus s ON s.id = ci.sku_id
    JOIN variants v ON v.id = s.variant_id
    JOIN products p ON p.id = s.product_id
   WHERE ci.user_id = $1
   ORDER BY ci.added_at, ci.sku_id`;

const formatItem = (row) => ({
  skuId: row.sku_id,
  productId: row.product_id,
  variantId: row.variant_id,
  quantity: row.quantity,
  size: row.size,
  model: row.model,
  type: row.type,
  color: row.color,
  price: row.price,
  slug: `${row.slug}-${colorSlug(row.color)}`,
  image: row.images[0]?.src || '',
});

const getCartRows = async (userId, client = { query }) =>
  (await client.query(CART_SELECT, [userId])).rows;

const getCart = async (userId, client = { query }) =>
  (await getCartRows(userId, client)).map(formatItem);

// Trims cart quantities down to available stock. Returns whether anything changed.
const reconcileCart = async (userId, client = { query }) => {
  const rows = await getCartRows(userId, client);
  let changed = false;

  for (const row of rows) {
    if (row.stock <= 0) {
      changed = true;
      await client.query(
        'DELETE FROM cart_items WHERE user_id = $1 AND sku_id = $2',
        [userId, row.sku_id]
      );
    } else if (row.quantity > row.stock) {
      changed = true;
      await client.query(
        'UPDATE cart_items SET quantity = $3 WHERE user_id = $1 AND sku_id = $2',
        [userId, row.sku_id, row.stock]
      );
    }
  }

  return { items: await getCart(userId, client), changed };
};

// Moves a guest cart into an account cart, capping each line at available stock.
const mergeCarts = async (fromUserId, toUserId, client) => {
  await client.query(
    `INSERT INTO cart_items (user_id, sku_id, quantity, added_at)
     SELECT $2, ci.sku_id, ci.quantity, ci.added_at
       FROM cart_items ci WHERE ci.user_id = $1
     ON CONFLICT (user_id, sku_id)
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
    [fromUserId, toUserId]
  );
  await client.query('DELETE FROM cart_items WHERE user_id = $1', [
    fromUserId,
  ]);
};

module.exports = { getCart, getCartRows, reconcileCart, mergeCarts };
