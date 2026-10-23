const express = require('express');

const { asyncHandler, badRequest, notFound } = require('../lib/errors');
const {
  listVariantCards,
  getProductBySlug,
} = require('../services/catalog');

const router = express.Router();

// "products" is the catch-all collection that shows everything.
const COLLECTIONS = ['products', 't-shirts', 'hoodies-sweatshirts', 'accessories', 'jackets'];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const collection = req.query.collection || 'products';
    if (!COLLECTIONS.includes(collection)) {
      throw badRequest('Unknown collection');
    }

    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 100);

    const result = await listVariantCards({
      collection: collection === 'products' ? null : collection,
      sortField: req.query.sort === 'price' ? 'price' : 'createdAt',
      direction: req.query.direction === 'desc' ? 'desc' : 'asc',
      offset,
      limit,
    });

    res.json(result);
  })
);

router.get(
  '/slug/:slug',
  asyncHandler(async (req, res) => {
    const result = await getProductBySlug(req.params.slug);
    if (!result) throw notFound('Product not found');
    res.json(result);
  })
);

module.exports = { router, COLLECTIONS };
