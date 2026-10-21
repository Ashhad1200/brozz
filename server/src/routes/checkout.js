const express = require('express');

const { query } = require('../db/pool');
const { requireAccount } = require('../middleware/auth');
const { asyncHandler, badRequest, notFound } = require('../lib/errors');
const { cleanEmail, requireUuid } = require('../lib/validate');

const router = express.Router();

// Shipping prices live on the server so the client can't choose its own cost.
const SHIPPING_COSTS = { standard: 0, expedited: 15 };

const formatSession = (row) => ({
  email: row.email,
  shippingAddress: { id: row.shipping_address_id },
  shippingOption: row.shipping_option,
  shippingCost: row.shipping_cost,
});

router.use(requireAccount);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `INSERT INTO checkout_sessions (user_id, email) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [req.user.id, req.user.email]
    );
    res.json(formatSession(rows[0]));
  })
);

router.put(
  '/shipping-info',
  asyncHandler(async (req, res) => {
    const email = cleanEmail(req.body.email);
    const addressId = requireUuid(req.body.shippingAddressId, 'shipping address');

    const { rows: owned } = await query(
      'SELECT id FROM addresses WHERE id = $1 AND user_id = $2',
      [addressId, req.user.id]
    );
    if (owned.length === 0) throw notFound('Address not found');

    const { rows } = await query(
      `INSERT INTO checkout_sessions (user_id, email, shipping_address_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET email = EXCLUDED.email, shipping_address_id = EXCLUDED.shipping_address_id,
             updated_at = NOW()
       RETURNING *`,
      [req.user.id, email, addressId]
    );
    res.json(formatSession(rows[0]));
  })
);

router.put(
  '/shipping-option',
  asyncHandler(async (req, res) => {
    const { option } = req.body;
    if (!(option in SHIPPING_COSTS)) {
      throw badRequest('Unknown shipping option');
    }

    const shippingOption = {
      standard: option === 'standard',
      expedited: option === 'expedited',
    };

    const { rows } = await query(
      `INSERT INTO checkout_sessions (user_id, email, shipping_option, shipping_cost)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET shipping_option = EXCLUDED.shipping_option,
             shipping_cost = EXCLUDED.shipping_cost, updated_at = NOW()
       RETURNING *`,
      [req.user.id, req.user.email, shippingOption, SHIPPING_COSTS[option]]
    );
    res.json(formatSession(rows[0]));
  })
);

module.exports = { router, SHIPPING_COSTS };
