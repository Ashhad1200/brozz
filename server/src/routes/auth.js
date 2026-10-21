const express = require('express');
const bcrypt = require('bcryptjs');

const { query, withTransaction } = require('../db/pool');
const {
  signToken,
  requireAuth,
  requireAccount,
  optionalAuth,
} = require('../middleware/auth');
const {
  asyncHandler,
  badRequest,
  unauthorized,
  conflict,
} = require('../lib/errors');
const {
  cleanString,
  cleanEmail,
  validatePassword,
} = require('../lib/validate');
const { getUserPayload } = require('../services/users');
const { mergeCarts, reconcileCart } = require('../services/cart');

const router = express.Router();

const sendSession = async (res, user, status = 200) => {
  res.status(status).json({
    token: signToken(user.id),
    user: await getUserPayload(user),
  });
};

// Every visitor gets a guest session so they can keep a cart before signing up.
router.post(
  '/guest',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'INSERT INTO users (is_anonymous) VALUES (TRUE) RETURNING *'
    );
    await sendSession(res, rows[0], 201);
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await getUserPayload(req.user) });
  })
);

router.post(
  '/signup',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const name = cleanString(req.body.name, 'Name', { max: 100 });
    const lastName = cleanString(req.body.lastName, 'Last name', { max: 100 });
    const email = cleanEmail(req.body.email);
    const password = validatePassword(req.body.password);

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await withTransaction(async (client) => {
      const existing = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      if (existing.rows.length > 0) {
        throw conflict('User already exists!');
      }

      // Upgrade the guest in place so their cart carries over.
      if (req.user?.is_anonymous) {
        const { rows } = await client.query(
          `UPDATE users
              SET email = $2, password_hash = $3, name = $4, last_name = $5,
                  is_anonymous = FALSE, last_login_at = NOW(),
                  password_changed_at = NOW()
            WHERE id = $1
            RETURNING *`,
          [req.user.id, email, passwordHash, name, lastName]
        );
        return rows[0];
      }

      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, name, last_name, last_login_at, password_changed_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [email, passwordHash, name, lastName]
      );
      return rows[0];
    });

    await sendSession(res, user, 201);
  })
);

router.post(
  '/login',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const email = cleanEmail(req.body.email);
    const { password } = req.body;
    if (typeof password !== 'string' || password.length === 0) {
      throw badRequest('Password is required');
    }

    const { rows } = await query(
      'SELECT * FROM users WHERE email = $1 AND is_anonymous = FALSE',
      [email]
    );
    const user = rows[0];
    const matches = user && (await bcrypt.compare(password, user.password_hash));
    if (!matches) {
      throw unauthorized('User/password is incorrect!');
    }

    const loggedIn = await withTransaction(async (client) => {
      const guest = req.user;
      if (guest?.is_anonymous && guest.id !== user.id) {
        await mergeCarts(guest.id, user.id, client);
        await client.query('DELETE FROM users WHERE id = $1', [guest.id]);
        await reconcileCart(user.id, client);
      }

      const { rows: updated } = await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1 RETURNING *',
        [user.id]
      );
      return updated[0];
    });

    await sendSession(res, loggedIn);
  })
);

router.put(
  '/password',
  requireAccount,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const matches =
      typeof currentPassword === 'string' &&
      (await bcrypt.compare(currentPassword, req.user.password_hash));
    if (!matches) {
      throw unauthorized('Current password is incorrect');
    }
    validatePassword(newPassword);

    await query(
      'UPDATE users SET password_hash = $2, password_changed_at = NOW() WHERE id = $1',
      [req.user.id, await bcrypt.hash(newPassword, 10)]
    );
    res.status(204).end();
  })
);

module.exports = router;
