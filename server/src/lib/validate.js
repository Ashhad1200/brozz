const { badRequest } = require('./errors');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const isUuid = (value) => typeof value === 'string' && UUID_REGEX.test(value);

const requireUuid = (value, field = 'id') => {
  if (!isUuid(value)) {
    throw badRequest(`Invalid ${field}`);
  }
  return value;
};

// Trims and collapses whitespace; throws if a required field ends up empty.
const cleanString = (value, field, { required = true, max = 500 } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') {
    throw badRequest(`${field} must be a string`);
  }
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (required && cleaned.length === 0) {
    throw badRequest(`${field} is required`);
  }
  if (cleaned.length > max) {
    throw badRequest(`${field} is too long`);
  }
  return cleaned.length === 0 ? null : cleaned;
};

const cleanEmail = (value) => {
  const email = cleanString(value, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw badRequest('Email is not valid');
  }
  return email;
};

const validatePassword = (password) => {
  if (typeof password !== 'string' || !PASSWORD_REGEX.test(password)) {
    throw badRequest(
      'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    );
  }
  return password;
};

const toNonNegativeNumber = (value, field) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw badRequest(`${field} must be a non-negative number`);
  }
  return number;
};

const toNonNegativeInt = (value, field) => {
  const number = toNonNegativeNumber(value, field);
  if (!Number.isInteger(number)) {
    throw badRequest(`${field} must be a whole number`);
  }
  return number;
};

module.exports = {
  isUuid,
  requireUuid,
  cleanString,
  cleanEmail,
  validatePassword,
  toNonNegativeNumber,
  toNonNegativeInt,
};
