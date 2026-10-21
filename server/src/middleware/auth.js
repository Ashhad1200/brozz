const jwt = require('jsonwebtoken');

const config = require('../config');
const { prisma } = require('../db/prisma');
const { unauthorized, forbidden } = require('../lib/errors');
const { isUuid } = require('../lib/validate');

const signToken = (userId) =>
  jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

const readToken = (req) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token.trim() : null;
};

// Resolves the bearer token to a user row; null when absent or invalid.
const loadUser = async (req) => {
  const token = readToken(req);
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }

  if (!isUuid(payload.sub)) return null;
  return prisma.user.findUnique({ where: { id: payload.sub } });
};

// Any session, guest or registered.
const requireAuth = async (req, res, next) => {
  try {
    const user = await loadUser(req);
    if (!user) return next(unauthorized('Session expired, please reload'));
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

const requireAccount = (req, res, next) =>
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.user.isAnonymous) {
      return next(unauthorized('Please log in to continue'));
    }
    next();
  });

const requireAdmin = (req, res, next) =>
  requireAccount(req, res, (err) => {
    if (err) return next(err);
    if (!req.user.isAdmin) return next(forbidden());
    next();
  });

const optionalAuth = async (req, res, next) => {
  try {
    req.user = await loadUser(req);
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  signToken,
  requireAuth,
  requireAccount,
  requireAdmin,
  optionalAuth,
};
