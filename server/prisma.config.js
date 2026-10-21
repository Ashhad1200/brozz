// Prisma CLI configuration (migrate, generate, studio).
// The CLI doesn't read .env on its own, so load it here.
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node src/db/seed.js',
  },
  datasource: {
    // `generate` doesn't need a database, so don't fail when this is unset.
    url: process.env.DATABASE_URL || '',
  },
});
