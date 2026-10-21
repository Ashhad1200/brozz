const express = require('express');

const { prisma } = require('../db/prisma');
const { asyncHandler } = require('../lib/errors');
const { cleanEmail } = require('../lib/validate');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const email = cleanEmail(req.body.email);
    const { count: created } = await prisma.newsletterSubscriber.createMany({
      data: [{ email }],
      skipDuplicates: true,
    });
    res
      .status(created ? 201 : 200)
      .json({ message: created ? 'Thanks for joining!' : 'You have already joined!' });
  })
);

module.exports = router;
