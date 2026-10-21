const { prisma } = require('../db/prisma');

const formatAddress = (row) => {
  const label = `${row.name} ${row.lastName} - ${row.address} - ${row.city}, ${row.state} ${row.zipCode}`;
  return {
    id: row.id,
    name: row.name,
    lastName: row.lastName,
    phoneNumber: row.phoneNumber,
    address: row.address,
    zipCode: row.zipCode,
    city: row.city,
    state: row.state,
    isMain: row.isMain,
    displayOrder: row.displayOrder,
    label,
    value: row.id,
  };
};

const getAddresses = async (userId, db = prisma) =>
  (
    await db.address.findMany({
      where: { userId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    })
  ).map(formatAddress);

// The shape the frontend auth context expects.
const formatUser = (user, addresses = []) => ({
  id: user.id,
  name: user.name,
  lastName: user.lastName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  isAdmin: user.isAdmin,
  isAnonymous: user.isAnonymous,
  isVerified: !user.isAnonymous,
  lastLoginAt: user.lastLoginAt,
  addresses,
});

const getUserPayload = async (user) =>
  formatUser(user, user.isAnonymous ? [] : await getAddresses(user.id));

module.exports = { formatAddress, getAddresses, formatUser, getUserPayload };
