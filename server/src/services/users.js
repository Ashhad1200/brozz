const { query } = require('../db/pool');

const formatAddress = (row) => {
  const label = `${row.name} ${row.last_name} - ${row.address} - ${row.city}, ${row.state} ${row.zip_code}`;
  return {
    id: row.id,
    name: row.name,
    lastName: row.last_name,
    phoneNumber: row.phone_number,
    address: row.address,
    zipCode: row.zip_code,
    city: row.city,
    state: row.state,
    isMain: row.is_main,
    displayOrder: row.display_order,
    label,
    value: row.id,
  };
};

const getAddresses = async (userId, client = { query }) => {
  const { rows } = await client.query(
    'SELECT * FROM addresses WHERE user_id = $1 ORDER BY display_order, created_at',
    [userId]
  );
  return rows.map(formatAddress);
};

// The shape the frontend auth context expects.
const formatUser = (user, addresses = []) => ({
  id: user.id,
  name: user.name,
  lastName: user.last_name,
  email: user.email,
  phoneNumber: user.phone_number,
  isAdmin: user.is_admin,
  isAnonymous: user.is_anonymous,
  isVerified: !user.is_anonymous,
  lastLoginAt: user.last_login_at,
  addresses,
});

const getUserPayload = async (user) =>
  formatUser(user, user.is_anonymous ? [] : await getAddresses(user.id));

module.exports = { formatAddress, getAddresses, formatUser, getUserPayload };
