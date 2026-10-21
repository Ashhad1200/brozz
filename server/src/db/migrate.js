const fs = require('fs');
const path = require('path');

const { pool } = require('./pool');

const migrate = async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
};

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Database schema is up to date');
      return pool.end();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrate };
