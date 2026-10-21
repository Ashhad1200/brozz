const express = require('express');

const { query, withTransaction } = require('../db/pool');
const { requireAccount } = require('../middleware/auth');
const { asyncHandler, notFound } = require('../lib/errors');
const { cleanString, requireUuid } = require('../lib/validate');
const { getAddresses, getUserPayload } = require('../services/users');

const router = express.Router();

router.use(requireAccount);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const name = cleanString(req.body.name, 'Name', { max: 100 });
    const lastName = cleanString(req.body.lastName, 'Last name', { max: 100 });
    const phoneNumber = cleanString(req.body.phoneNumber, 'Phone number', {
      required: false,
      max: 40,
    });

    const { rows } = await query(
      `UPDATE users SET name = $2, last_name = $3, phone_number = $4
        WHERE id = $1 RETURNING *`,
      [req.user.id, name, lastName, phoneNumber]
    );
    res.json({ user: await getUserPayload(rows[0]) });
  })
);

const readAddress = (body) => ({
  name: cleanString(body.name, 'Name', { max: 100 }),
  lastName: cleanString(body.lastName, 'Last name', { max: 100 }),
  phoneNumber: cleanString(body.phoneNumber, 'Phone number', {
    required: false,
    max: 40,
  }),
  address: cleanString(body.address, 'Address', { max: 200 }),
  zipCode: cleanString(body.zipCode, 'Zip code', { max: 20 }),
  city: cleanString(body.city, 'City', { max: 100 }),
  state: cleanString(body.state, 'State', { max: 100 }),
  isMain: body.isMain === true,
});

// Keeps the main address first and display_order contiguous (1..n).
const normalizeAddresses = async (client, userId, mainId) => {
  if (mainId) {
    await client.query(
      'UPDATE addresses SET is_main = (id = $2) WHERE user_id = $1',
      [userId, mainId]
    );
  } else {
    // Guarantee that a non-empty address book always has a main address.
    await client.query(
      `UPDATE addresses SET is_main = TRUE
        WHERE id = (SELECT id FROM addresses WHERE user_id = $1
                     ORDER BY display_order, created_at LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1 AND is_main)`,
      [userId]
    );
  }

  await client.query(
    `UPDATE addresses a SET display_order = ordered.rn
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY is_main DESC, display_order, created_at) AS rn
               FROM addresses WHERE user_id = $1) ordered
      WHERE a.id = ordered.id`,
    [userId]
  );

  return getAddresses(userId, client);
};

router.post(
  '/addresses',
  asyncHandler(async (req, res) => {
    const input = readAddress(req.body);

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO addresses (user_id, name, last_name, phone_number, address, zip_code, city, state, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 (SELECT COALESCE(MAX(display_order), 0) + 1 FROM addresses WHERE user_id = $1))
         RETURNING id`,
        [
          req.user.id,
          input.name,
          input.lastName,
          input.phoneNumber,
          input.address,
          input.zipCode,
          input.city,
          input.state,
        ]
      );
      const id = rows[0].id;
      const addresses = await normalizeAddresses(
        client,
        req.user.id,
        input.isMain ? id : null
      );
      return { address: addresses.find((a) => a.id === id), addresses };
    });

    res.status(201).json(result);
  })
);

router.put(
  '/addresses/:id',
  asyncHandler(async (req, res) => {
    const id = requireUuid(req.params.id, 'address id');
    const input = readAddress(req.body);

    const addresses = await withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE addresses
            SET name = $3, last_name = $4, phone_number = $5, address = $6,
                zip_code = $7, city = $8, state = $9
          WHERE id = $1 AND user_id = $2`,
        [
          id,
          req.user.id,
          input.name,
          input.lastName,
          input.phoneNumber,
          input.address,
          input.zipCode,
          input.city,
          input.state,
        ]
      );
      if (rowCount === 0) throw notFound('Address not found');
      // Un-ticking "main" is ignored: there must always be a main address.
      return normalizeAddresses(client, req.user.id, input.isMain ? id : null);
    });

    res.json({ addresses });
  })
);

router.delete(
  '/addresses/:id',
  asyncHandler(async (req, res) => {
    const id = requireUuid(req.params.id, 'address id');

    const addresses = await withTransaction(async (client) => {
      const { rowCount } = await client.query(
        'DELETE FROM addresses WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (rowCount === 0) throw notFound('Address not found');
      return normalizeAddresses(client, req.user.id, null);
    });

    res.json({ addresses });
  })
);

module.exports = router;
