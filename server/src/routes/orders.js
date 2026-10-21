const express = require('express');

const { prisma, toNumber } = require('../db/prisma');
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

const formatOrder = (order) => ({
  id: order.id,
  createdAt: order.createdAt,
  email: order.email,
  items: order.items,
  shippingAddress: order.shippingAddress,
  billingAddress: order.billingAddress,
  shippingOption: order.shippingOption,
  shippingCost: toNumber(order.shippingCost),
  subtotal: toNumber(order.subtotal),
  total: toNumber(order.total),
  paymentInfo: order.paymentInfo,
  status: order.status,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders: orders.map(formatOrder) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const paymentInfo = readPayment(req.body.payment);
    const userId = req.user.id;

    try {
      const order = await prisma.$transaction(async (tx) => {
        const session = await tx.checkoutSession.findUnique({
          where: { userId },
          include: { shippingAddress: true },
        });
        if (!session?.shippingAddress || session.shippingAddress.userId !== userId) {
          throw badRequest('Please choose a shipping address');
        }
        if (!session.shippingOption.standard && !session.shippingOption.expedited) {
          throw badRequest('Please choose a shipping option');
        }

        const { id, label, value, isMain, displayOrder, ...shippingAddress } =
          formatAddress(session.shippingAddress);

        const lines = await getCartRows(userId, tx);
        if (lines.length === 0) throw badRequest('Your cart is empty');

        // Lock stock rows, then verify every line is still available.
        const stock = await tx.$queryRaw`
          SELECT id, quantity FROM skus
           WHERE id = ANY(${lines.map((line) => line.skuId)}::uuid[])
             FOR UPDATE`;
        const available = new Map(stock.map((sku) => [sku.id, sku.quantity]));
        if (lines.some((line) => (available.get(line.skuId) ?? 0) < line.quantity)) {
          throw conflict(STOCK_CHANGED);
        }

        for (const line of lines) {
          await tx.sku.update({
            where: { id: line.skuId },
            data: { quantity: { decrement: line.quantity } },
          });
        }

        const items = lines.map(({ skuId, quantity, sku }) => ({
          skuId,
          productId: sku.productId,
          variantId: sku.variantId,
          model: sku.product.model,
          type: sku.product.type,
          color: sku.variant.color,
          size: sku.size,
          price: toNumber(sku.variant.price),
          quantity,
          slug: `${sku.product.slug}-${colorSlug(sku.variant.color)}`,
          image: sku.variant.images[0]?.src || '',
        }));
        const subtotal = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const shippingCost = toNumber(session.shippingCost);

        const created = await tx.order.create({
          data: {
            userId,
            email: session.email || req.user.email,
            items,
            shippingAddress,
            billingAddress: readBillingAddress(req.body.billingAddress, shippingAddress),
            shippingOption: session.shippingOption,
            shippingCost,
            subtotal,
            total: subtotal + shippingCost,
            paymentInfo,
          },
        });

        await tx.cartItem.deleteMany({ where: { userId } });
        await tx.checkoutSession.delete({ where: { userId } });

        return created;
      });

      res.status(201).json({ order: formatOrder(order) });
    } catch (err) {
      if (err instanceof HttpError && err.message === STOCK_CHANGED) {
        // Stock moved underneath the shopper: trim the cart and let them review.
        await prisma.$transaction((tx) => reconcileCart(userId, tx));
        return res
          .status(409)
          .json({ message: STOCK_CHANGED, items: await getCart(userId) });
      }
      throw err;
    }
  })
);

module.exports = router;
