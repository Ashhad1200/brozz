const express = require('express');

const { query, withTransaction } = require('../db/pool');
const { requireAccount } = require('../middleware/auth');
const {
  asyncHandler,
  badRequest,
  conflict,
  HttpError,
} = require('../lib/errors');
const { cleanString } = require('../lib/validate');
const { getCartRows, reconcileCart, getCart } = require('../services/cart');
const { formatAddress } = require('../services/users');
const { colorSlug } = require('../lib/slug');

const router = express.Router();

router.use(requireAccount);

const STOCK_CHANGED =
  'Available stock is limited. Quantities in cart have been updated!';

// Payments are mocked: validate the card's shape, keep only name and last 4.
const readPayment = (payment = {}) => {
  const digits = String(payment.cardNumber || '').replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) {
    throw badRequest('Card number is not valid');
  }

  const name = cleanString(payment.name, 'Name on card', { max: 100 });

  const match = /^(\d{2})\/(\d{2})$/.exec(String(payment.expiryDate || ''));
  const month = match ? Number(match[1]) : 0;
  if (!match || month < 1 || month > 12) {
    throw badRequest('Expiry date must be MM/YY');
  }
  const expiresAt = new Date(2000 + Number(match[2]), month, 1);
  if (expiresAt <= new Date()) {
    throw badRequest('Card is expired');
  }

  if (!/^\d{3,4}$/.test(String(payment.securityCode || ''))) {
    throw badRequest('Security code is not valid');
  }

  return { name, last4: digits.slice(-4) };
};

const readBillingAddress = (body, fallback) => {
  if (!body || !body.address) return fallback;
  return {
    name: cleanString(body.name, 'Billing name', { max: 100 }),
    lastName: cleanString(body.lastName, 'Billing last name', { max: 100 }),
    phoneNumber: cleanString(body.phoneNumber, 'Billing phone number', {
      required: false,
      max: 40,
    }),
    address: cleanString(body.address, 'Billing address', { max: 200 }),
    zipCode: cleanString(body.zipCode, 'Billing zip code', { max: 20 }),
    city: cleanString(body.city, 'Billing city', { max: 100 }),
    state: cleanString(body.state, 'Billing state', { max: 100 }),
  };
};

const formatOrder = (row) => ({
  id: row.id,
  createdAt: row.created_at,
  email: row.email,
  items: row.items,
  shippingAddress: row.shipping_address,
  billingAddress: row.billing_address,
  shippingOption: row.shipping_option,
  shippingCost: row.shipping_cost,
  subtotal: row.subtotal,
  total: row.total,
  paymentInfo: row.payment_info,
  status: row.status,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ orders: rows.map(formatOrder) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const paymentInfo = readPayment(req.body.payment);
    const userId = req.user.id;

    try {
      const order = await withTransaction(async (client) => {
        const { rows: sessions } = await client.query(
          'SELECT * FROM checkout_sessions WHERE user_id = $1',
          [userId]
        );
        const session = sessions[0];
        if (!session?.shipping_address_id) {
          throw badRequest('Please choose a shipping address');
        }
        if (!session.shipping_option.standard && !session.shipping_option.expedited) {
          throw badRequest('Please choose a shipping option');
        }

        const { rows: addressRows } = await client.query(
          'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
          [session.shipping_address_id, userId]
        );
        if (addressRows.length === 0) {
          throw badRequest('Please choose a shipping address');
        }
        const { id, label, value, isMain, displayOrder, ...shippingAddress } =
          formatAddress(addressRows[0]);

        const lines = await getCartRows(userId, client);
        if (lines.length === 0) throw badRequest('Your cart is empty');

        // Lock stock rows, then verify every line is still available.
        const { rows: stock } = await client.query(
          'SELECT id, quantity FROM skus WHERE id = ANY($1::uuid[]) FOR UPDATE',
          [lines.map((line) => line.sku_id)]
        );
        const available = new Map(stock.map((sku) => [sku.id, sku.quantity]));
        if (lines.some((line) => (available.get(line.sku_id) ?? 0) < line.quantity)) {
          throw conflict(STOCK_CHANGED);
        }

        for (const line of lines) {
          await client.query(
            'UPDATE skus SET quantity = quantity - $2, updated_at = NOW() WHERE id = $1',
            [line.sku_id, line.quantity]
          );
        }

        const items = lines.map((line) => ({
          skuId: line.sku_id,
          productId: line.product_id,
          variantId: line.variant_id,
          model: line.model,
          type: line.type,
          color: line.color,
          size: line.size,
          price: line.price,
          quantity: line.quantity,
          slug: `${line.slug}-${colorSlug(line.color)}`,
          image: line.images[0]?.src || '',
        }));
        const subtotal = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const total = subtotal + session.shipping_cost;

        const { rows } = await client.query(
          `INSERT INTO orders (user_id, email, items, shipping_address, billing_address,
                               shipping_option, shipping_cost, subtotal, total, payment_info)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            userId,
            session.email || req.user.email,
            JSON.stringify(items),
            shippingAddress,
            readBillingAddress(req.body.billingAddress, shippingAddress),
            session.shipping_option,
            session.shipping_cost,
            subtotal,
            total,
            paymentInfo,
          ]
        );

        await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM checkout_sessions WHERE user_id = $1', [
          userId,
        ]);

        return rows[0];
      });

      res.status(201).json({ order: formatOrder(order) });
    } catch (err) {
      if (err instanceof HttpError && err.message === STOCK_CHANGED) {
        // Stock moved underneath the shopper: trim the cart and let them review.
        await withTransaction((client) => reconcileCart(userId, client));
        return res
          .status(409)
          .json({ message: STOCK_CHANGED, items: await getCart(userId) });
      }
      throw err;
    }
  })
);

module.exports = router;
