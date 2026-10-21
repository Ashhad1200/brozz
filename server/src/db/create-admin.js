// Usage: npm run create-admin -- <email> <password> [name] [lastName]
// Creates an admin account, or promotes an existing account to admin.
const bcrypt = require('bcryptjs');

const { prisma } = require('./prisma');
const { cleanEmail, validatePassword } = require('../lib/validate');

const run = async () => {
  const [emailArg, password, name = 'Admin', lastName = 'User'] =
    process.argv.slice(2);
  if (!emailArg || !password) {
    throw new Error('Usage: npm run create-admin -- <email> <password> [name] [lastName]');
  }
  const email = cleanEmail(emailArg);
  validatePassword(password);

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name,
      lastName,
      isAdmin: true,
      passwordChangedAt: new Date(),
    },
    update: { isAdmin: true, isAnonymous: false, passwordHash, passwordChangedAt: new Date() },
  });
  console.log(`${email} is now an admin`);
};

run()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
