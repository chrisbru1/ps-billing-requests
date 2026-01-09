#!/usr/bin/env node
/**
 * Refresh Balance Cache Script
 *
 * Run via Heroku Scheduler to keep the Postgres balance cache fresh.
 * Recommended schedule: Every 1 hour during business hours, or every 4 hours
 *
 * Usage:
 *   node scripts/refresh-balance-cache.js
 *
 * Or via Heroku Scheduler:
 *   heroku scheduler:add --app ps-billing-requests
 *   Set command: node scripts/refresh-balance-cache.js
 */

require('dotenv').config();

const dbCache = require('../financial-analyst/db/cache');
const workflows = require('../financial-analyst/workflows');

async function main() {
  console.log('='.repeat(60));
  console.log('Balance Cache Refresh');
  console.log('Started:', new Date().toISOString());
  console.log('='.repeat(60));

  try {
    // Initialize DB table (idempotent)
    await dbCache.initCacheTable();

    // Check current cache status
    const status = await dbCache.getCacheStatus();
    console.log('\nCurrent cache status:', status.message);

    // Force refresh from Rillet
    console.log('\nFetching all account balances from Rillet...');
    const startTime = Date.now();

    const balances = await workflows.refreshBalanceCache();

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const accountCount = Object.keys(balances).length;

    console.log('\n' + '='.repeat(60));
    console.log('Refresh Complete');
    console.log(`  Accounts: ${accountCount}`);
    console.log(`  Duration: ${elapsed}s`);
    console.log(`  Finished: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    // Clean exit
    await dbCache.closePool();
    process.exit(0);

  } catch (error) {
    console.error('\nRefresh failed:', error.message);
    console.error(error.stack);
    await dbCache.closePool();
    process.exit(1);
  }
}

main();
