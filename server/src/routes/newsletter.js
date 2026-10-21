const express = require('express');

const { query } = require('../db/pool');
const { asyncHandler } = require('../lib/errors');
const { cleanEmail } = require('../lib/validate');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const email = cleanEmail(req.body.email);
    const { rowCount } = await query(
      `INSERT INTO newsletter_subscribers (email) VALUES ($1)
       ON CONFLICT (email) DO NOTHING`,
      [email]
    );
    res
      .status(rowCount ? 201 : 200)
      .json({ message: rowCount ? 'Thanks for joining!' : 'You have already joined!' });
  })
);

module.exports = router;
