const config = require('./config');
const { createApp } = require('./app');

// Migrations run before this via `npm start` (prisma migrate deploy).
createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
