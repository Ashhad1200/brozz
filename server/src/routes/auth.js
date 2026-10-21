const express = require('express');
const bcrypt = require('bcryptjs');

const { prisma } = require('../db/prisma');
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
    const user = await prisma.user.create({ data: { isAnonymous: true } });
    await sendSession(res, user, 201);
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

    const account = {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      lastName,
      lastLoginAt: new Date(),
      passwordChangedAt: new Date(),
    };

    const user = await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        throw conflict('User already exists!');
      }

      // Upgrade the guest in place so their cart carries over.
      if (req.user?.isAnonymous) {
        return tx.user.update({
          where: { id: req.user.id },
          data: { ...account, isAnonymous: false },
        });
      }
      return tx.user.create({ data: account });
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

    const user = await prisma.user.findFirst({
      where: { email, isAnonymous: false },
    });
    const matches = user && (await bcrypt.compare(password, user.passwordHash));
    if (!matches) {
      throw unauthorized('User/password is incorrect!');
    }

    const loggedIn = await prisma.$transaction(async (tx) => {
      const guest = req.user;
      if (guest?.isAnonymous && guest.id !== user.id) {
        await mergeCarts(guest.id, user.id, tx);
        await tx.user.delete({ where: { id: guest.id } });
        await reconcileCart(user.id, tx);
      }

      return tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
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
      (await bcrypt.compare(currentPassword, req.user.passwordHash));
    if (!matches) {
      throw unauthorized('Current password is incorrect');
    }
    validatePassword(newPassword);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        passwordChangedAt: new Date(),
      },
    });
    res.status(204).end();
  })
);

module.exports = router;
