const express = require('express');

const { prisma, toNumber } = require('../db/prisma');
const { requireAccount } = require('../middleware/auth');
const { asyncHandler, badRequest, notFound } = require('../lib/errors');
const { cleanEmail, requireUuid } = require('../lib/validate');

const router = express.Router();

// Shipping prices live on the server so the client can't choose its own cost.
const SHIPPING_COSTS = { standard: 0, expedited: 15 };

const formatSession = (session) => ({
  email: session.email,
  shippingAddress: { id: session.shippingAddressId },
  shippingOption: session.shippingOption,
  shippingCost: toNumber(session.shippingCost),
});

// Creates or updates the user's checkout session.
const saveSession = (user, data) =>
  prisma.checkoutSession.upsert({
    where: { userId: user.id },
    create: { userId: user.id, email: user.email, ...data },
    update: data,
  });

router.use(requireAccount);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(formatSession(await saveSession(req.user, {})));
  })
);

router.put(
  '/shipping-info',
  asyncHandler(async (req, res) => {
    const email = cleanEmail(req.body.email);
    const addressId = requireUuid(req.body.shippingAddressId, 'shipping address');

    const owned = await prisma.address.findFirst({
      where: { id: addressId, userId: req.user.id },
      select: { id: true },
    });
    if (!owned) throw notFound('Address not found');

    const session = await saveSession(req.user, {
      email,
      shippingAddressId: addressId,
    });
    res.json(formatSession(session));
  })
);

router.put(
  '/shipping-option',
  asyncHandler(async (req, res) => {
    const { option } = req.body;
    if (typeof option !== 'string' || !Object.hasOwn(SHIPPING_COSTS, option)) {
      throw badRequest('Unknown shipping option');
    }

    const session = await saveSession(req.user, {
      shippingOption: {
        standard: option === 'standard',
        expedited: option === 'expedited',
      },
      shippingCost: SHIPPING_COSTS[option],
    });
    res.json(formatSession(session));
  })
);

module.exports = { router, SHIPPING_COSTS };
