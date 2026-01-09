#!/usr/bin/env node
/**
 * Initialize Database Script
 *
 * Creates the required tables for the financial analyst cache.
 * Safe to run multiple times (uses IF NOT EXISTS).
 *
 * Usage:
 *   node scripts/init-db.js
 */

require('dotenv').config();

const dbCache = require('../financial-analyst/db/cache');

async function main() {
  console.log('Initializing database tables...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '(set)' : '(not set)');

  try {
    await dbCache.initCacheTable();
    console.log('Database initialization complete.');
    await dbCache.closePool();
    process.exit(0);
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    console.error(error.stack);
    await dbCache.closePool();
    process.exit(1);
  }
}

main();
