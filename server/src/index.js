const config = require('./config');
const { migrate } = require('./db/migrate');
const { createApp } = require('./app');

migrate()
  .then(() => {
    createApp().listen(config.port, () => {
      console.log(`API listening on http://localhost:${config.port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
