// Usage: npm run create-admin -- <email> <password> [name] [lastName]
// Creates an admin account, or promotes an existing account to admin.
const bcrypt = require('bcryptjs');

const { pool, query } = require('./pool');
const { migrate } = require('./migrate');
const { cleanEmail, validatePassword } = require('../lib/validate');

const run = async () => {
  const [emailArg, password, name = 'Admin', lastName = 'User'] =
    process.argv.slice(2);
  if (!emailArg || !password) {
    throw new Error('Usage: npm run create-admin -- <email> <password> [name] [lastName]');
  }
  const email = cleanEmail(emailArg);
  validatePassword(password);

  await migrate();
  const passwordHash = await bcrypt.hash(password, 10);
  await query(
    `INSERT INTO users (email, password_hash, name, last_name, is_admin, password_changed_at)
     VALUES ($1, $2, $3, $4, TRUE, NOW())
     ON CONFLICT (email) DO UPDATE
       SET is_admin = TRUE, password_hash = EXCLUDED.password_hash`,
    [email, passwordHash, name, lastName]
  );
  console.log(`${email} is now an admin`);
};

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
