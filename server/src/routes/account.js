const express = require('express');

const { prisma } = require('../db/prisma');
const { requireAccount } = require('../middleware/auth');
const { asyncHandler, notFound } = require('../lib/errors');
const { cleanString, requireUuid } = require('../lib/validate');
const { getAddresses, getUserPayload } = require('../services/users');

const router = express.Router();

router.use(requireAccount);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: cleanString(req.body.name, 'Name', { max: 100 }),
        lastName: cleanString(req.body.lastName, 'Last name', { max: 100 }),
        phoneNumber: cleanString(req.body.phoneNumber, 'Phone number', {
          required: false,
          max: 40,
        }),
      },
    });
    res.json({ user: await getUserPayload(user) });
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
});

// Keeps exactly one main address, listed first, with display_order 1..n.
const normalizeAddresses = async (tx, userId, mainId) => {
  const addresses = await tx.address.findMany({
    where: { userId },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (addresses.length === 0) return [];

  const main =
    addresses.find((a) => a.id === mainId) ||
    addresses.find((a) => a.isMain) ||
    addresses[0];
  const ordered = [main, ...addresses.filter((a) => a.id !== main.id)];

  for (const [index, address] of ordered.entries()) {
    const isMain = address.id === main.id;
    if (address.isMain !== isMain || address.displayOrder !== index + 1) {
      await tx.address.update({
        where: { id: address.id },
        data: { isMain, displayOrder: index + 1 },
      });
    }
  }

  return getAddresses(userId, tx);
};

router.post(
  '/addresses',
  asyncHandler(async (req, res) => {
    const input = readAddress(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId: req.user.id } });
      const { id } = await tx.address.create({
        data: { ...input, userId: req.user.id, displayOrder: count + 1 },
      });
      const addresses = await normalizeAddresses(
        tx,
        req.user.id,
        req.body.isMain === true ? id : null
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

    const addresses = await prisma.$transaction(async (tx) => {
      const { count } = await tx.address.updateMany({
        where: { id, userId: req.user.id },
        data: input,
      });
      if (count === 0) throw notFound('Address not found');
      // Un-ticking "main" is ignored: there must always be a main address.
      return normalizeAddresses(
        tx,
        req.user.id,
        req.body.isMain === true ? id : null
      );
    });

    res.json({ addresses });
  })
);

router.delete(
  '/addresses/:id',
  asyncHandler(async (req, res) => {
    const id = requireUuid(req.params.id, 'address id');

    const addresses = await prisma.$transaction(async (tx) => {
      const { count } = await tx.address.deleteMany({
        where: { id, userId: req.user.id },
      });
      if (count === 0) throw notFound('Address not found');
      return normalizeAddresses(tx, req.user.id, null);
    });

    res.json({ addresses });
  })
);

module.exports = router;
