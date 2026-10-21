const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const express = require('express');
const multer = require('multer');

const config = require('../config');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler, badRequest } = require('../lib/errors');
const { requireUuid } = require('../lib/validate');
const {
  saveProduct,
  getProductForEdit,
  deleteProduct,
  deleteVariant,
  removeUnusedUploads,
} = require('../services/adminProducts');
const { seedProducts } = require('../db/seed');

const router = express.Router();

router.use(requireAdmin);

const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(config.uploadDir, { recursive: true });
      cb(null, config.uploadDir);
    },
    // Random names: never trust the client's filename on disk.
    filename: (req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
  }),
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    cb(badRequest('Only JPEG, PNG, WEBP and GIF images are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
});

router.post(
  '/uploads',
  upload.array('images', 20),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) throw badRequest('No images uploaded');

    res.status(201).json({
      images: files.map((file) => ({
        id: path.parse(file.filename).name,
        name: file.originalname,
        src: `/uploads/${file.filename}`,
      })),
    });
  })
);

// Deletes an uploaded image that isn't attached to any saved product.
router.delete(
  '/uploads/:filename',
  asyncHandler(async (req, res) => {
    const filename = path.basename(req.params.filename);
    await removeUnusedUploads([{ src: `/uploads/${filename}` }]);
    res.status(204).end();
  })
);

router.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const product = await getProductForEdit(requireUuid(req.params.id));
    res.json({ product });
  })
);

router.post(
  '/products',
  asyncHandler(async (req, res) => {
    const id = await saveProduct(req.body);
    res.status(201).json({ product: await getProductForEdit(id) });
  })
);

router.put(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const id = await saveProduct(req.body, requireUuid(req.params.id));
    res.json({ product: await getProductForEdit(id) });
  })
);

router.delete(
  '/products/:id',
  asyncHandler(async (req, res) => {
    await deleteProduct(requireUuid(req.params.id));
    res.status(204).end();
  })
);

router.delete(
  '/products/:id/variants/:variantId',
  asyncHandler(async (req, res) => {
    const result = await deleteVariant(
      requireUuid(req.params.id),
      requireUuid(req.params.variantId, 'variant id')
    );
    res.json(result);
  })
);

router.post(
  '/seed',
  asyncHandler(async (req, res) => {
    res.json(await seedProducts());
  })
);

module.exports = router;
