const fs = require('fs');
const path = require('path');

const express = require('express');
const cors = require('cors');
const multer = require('multer');

const config = require('./config');
const { HttpError } = require('./lib/errors');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const { router: productRoutes } = require('./routes/products');
const cartRoutes = require('./routes/cart');
const { router: checkoutRoutes } = require('./routes/checkout');
const orderRoutes = require('./routes/orders');
const newsletterRoutes = require('./routes/newsletter');
const adminRoutes = require('./routes/admin');

const FRONTEND_DIST = path.join(__dirname, '..', '..', 'react-shopping-cart', 'dist');

const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/checkout', checkoutRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/newsletter', newsletterRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

  fs.mkdirSync(config.uploadDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));

  // In production the API also serves the built frontend.
  if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (req, res) =>
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
    );
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ message: err.message });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Malformed JSON body' });
    }
    if (err.code === '23505') {
      // Postgres unique violation, e.g. a SKU code that's already taken.
      return res
        .status(409)
        .json({ message: 'That value is already in use', detail: err.detail });
    }

    console.error(err);
    res.status(500).json({ message: 'An unexpected error occurred' });
  });

  return app;
};

module.exports = { createApp };
