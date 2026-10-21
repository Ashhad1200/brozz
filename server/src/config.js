const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const isTest = process.env.NODE_ENV === 'test';

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

module.exports = {
  isTest,
  port: Number(process.env.PORT) || 8000,
  databaseUrl: isTest
    ? required('TEST_DATABASE_URL')
    : required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadDir: path.resolve(
    __dirname,
    '..',
    isTest ? 'test-uploads' : process.env.UPLOAD_DIR || 'uploads'
  ),
  publicUrl: process.env.PUBLIC_URL || '',
};
