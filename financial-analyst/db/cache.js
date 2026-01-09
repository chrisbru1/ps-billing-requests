// Persistent balance cache using Heroku Postgres
const { Pool } = require('pg');

// Use DATABASE_URL from Heroku (automatically set when you add Postgres)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Initialize the cache table (run once on setup)
 */
async function initCacheTable() {
  if (!process.env.DATABASE_URL) {
    console.log('[DB] No DATABASE_URL configured, skipping table init');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS balance_cache (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        account_count INTEGER DEFAULT 0
      )
    `);
    console.log('[DB] balance_cache table ready');
  } finally {
    client.release();
  }
}

/**
 * Get cached balances from Postgres
 * @returns {object|null} - Cached balance data or null if no cache
 */
async function getBalanceCache() {
  if (!process.env.DATABASE_URL) {
    console.log('[DB] No DATABASE_URL configured, skipping cache');
    return null;
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT data, created_at, account_count
      FROM balance_cache
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    const ageMinutes = Math.round(ageMs / 60000);
    const ageHours = Math.round(ageMinutes / 60);

    console.log(`[DB] Found cached balances: ${row.account_count} accounts, ${ageHours > 0 ? ageHours + 'h' : ageMinutes + 'm'} old`);

    return {
      balances: row.data,
      created_at: row.created_at,
      age_ms: ageMs,
      age_minutes: ageMinutes,
      age_hours: ageHours,
      account_count: row.account_count
    };
  } finally {
    client.release();
  }
}

/**
 * Save balances to Postgres cache
 * @param {object} balances - Account balances object
 */
async function setBalanceCache(balances) {
  if (!process.env.DATABASE_URL) {
    console.log('[DB] No DATABASE_URL configured, skipping cache save');
    return;
  }

  const client = await pool.connect();
  try {
    const accountCount = Object.keys(balances).length;

    // Ensure table exists
    await initCacheTable();

    // Delete old cache entries (keep only last 5 for history)
    await client.query(`
      DELETE FROM balance_cache
      WHERE id NOT IN (
        SELECT id FROM balance_cache
        ORDER BY created_at DESC
        LIMIT 4
      )
    `);

    // Insert new cache
    await client.query(
      'INSERT INTO balance_cache (data, account_count) VALUES ($1, $2)',
      [JSON.stringify(balances), accountCount]
    );

    console.log(`[DB] Saved ${accountCount} account balances to cache`);
  } finally {
    client.release();
  }
}

/**
 * Get cache status
 */
async function getCacheStatus() {
  const cache = await getBalanceCache();

  if (!cache) {
    return {
      cached: false,
      message: 'No balance cache in database. Run refresh to populate.'
    };
  }

  return {
    cached: true,
    account_count: cache.account_count,
    age_minutes: cache.age_minutes,
    age_hours: cache.age_hours,
    created_at: cache.created_at,
    message: cache.age_hours > 0
      ? `Cache is ${cache.age_hours} hours old (${cache.account_count} accounts)`
      : `Cache is ${cache.age_minutes} minutes old (${cache.account_count} accounts)`
  };
}

/**
 * Close the pool (for graceful shutdown)
 */
async function closePool() {
  if (process.env.DATABASE_URL) {
    await pool.end();
  }
}

module.exports = {
  initCacheTable,
  getBalanceCache,
  setBalanceCache,
  getCacheStatus,
  closePool
};
