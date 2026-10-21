const { Pool, types } = require('pg');

const config = require('../config');

// Return NUMERIC columns (prices) as JS numbers instead of strings.
types.setTypeParser(types.builtins.NUMERIC, (value) =>
  value === null ? null : parseFloat(value)
);

const pool = new Pool({ connectionString: config.databaseUrl });

const query = (text, params) => pool.query(text, params);

// Runs fn inside a transaction, passing it a dedicated client.
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, withTransaction };
