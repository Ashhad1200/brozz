const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const config = require('../config');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.databaseUrl }),
});

// Prices are DECIMAL in Postgres; the API sends plain numbers.
const toNumber = (value) => (value === null || value === undefined ? value : Number(value));

module.exports = { prisma, Prisma, toNumber };
