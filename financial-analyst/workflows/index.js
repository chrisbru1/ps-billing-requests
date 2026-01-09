// Financial Analyst Workflows
// High-level orchestrated operations that combine multiple data sources

const dbCache = require('../db/cache');

const RILLET_API_BASE = process.env.RILLET_API_BASE_URL || 'https://api.rillet.com';

/**
 * Helper to make authenticated Rillet API calls
 */
async function rilletFetch(endpoint, params = {}) {
  const apiKey = process.env.RILLET_API_KEY;
  if (!apiKey) {
    throw new Error('RILLET_API_KEY not configured');
  }

  const url = new URL(`${RILLET_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  if (!response.ok) {
    throw new Error(`Rillet API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch all accounts from Rillet (cached for the session)
 */
let accountsCache = null;
let accountsCacheTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAllAccounts() {
  const now = Date.now();
  if (accountsCache && accountsCacheTime && (now - accountsCacheTime) < CACHE_TTL) {
    return accountsCache;
  }

  console.log('[Workflow] Fetching accounts from Rillet...');
  const data = await rilletFetch('/accounts');
  accountsCache = data.accounts || [];
  accountsCacheTime = now;
  console.log(`[Workflow] Cached ${accountsCache.length} accounts`);
  return accountsCache;
}

/**
 * Common search term mappings to subtypes
 * When users search for these terms, we should look at subtype instead of name
 * Values can be a single subtype string OR an array of subtypes
 */
const SEARCH_TO_SUBTYPE_MAP = {
  // "Cash" in FP&A means all liquid assets
  'cash': ['Cash', 'Bank'],
  'bank': 'Bank',
  'liquid': ['Cash', 'Bank'],
  'liquidity': ['Cash', 'Bank'],

  // Receivables
  'ar': 'Accounts Receivable',
  'accounts receivable': 'Accounts Receivable',
  'receivable': 'Accounts Receivable',
  'receivables': 'Accounts Receivable',

  // Payables
  'ap': 'Accounts Payable',
  'accounts payable': 'Accounts Payable',
  'payable': 'Accounts Payable',
  'payables': 'Accounts Payable',

  // Other common categories
  'prepaid': 'Prepaid',
  'prepaids': 'Prepaid',
  'accrued': 'Accrued',
  'accruals': 'Accrued',
  'revenue': 'Revenue',
  'deferred revenue': 'Deferred Revenue',
  'deferred': 'Deferred Revenue',
  'fixed assets': 'Fixed Assets',
  'fa': 'Fixed Assets',
};

/**
 * Exclusion patterns for certain search terms AND subtypes
 * When searching for these terms, exclude accounts matching these patterns
 */
const SEARCH_EXCLUSIONS = {
  'cash': [
    'receivable', 'receivables',  // Not cash - these are AR
    'clearing',                    // Transit/clearing accounts distort cash
    'money in transit',            // Transit accounts
    'in transit',                  // Transit accounts
  ],
  'liquid': [
    'receivable', 'receivables',
    'clearing',
    'money in transit',
    'in transit',
  ],
  'liquidity': [
    'receivable', 'receivables',
    'clearing',
    'money in transit',
    'in transit',
  ],
  'bank': [
    'receivable', 'receivables',
    'clearing',
    'money in transit',
    'in transit',
  ],
};

/**
 * Subtype to exclusions mapping
 * When querying by subtype directly, also apply these exclusions
 */
const SUBTYPE_EXCLUSIONS = {
  'cash': SEARCH_EXCLUSIONS['cash'],
  'bank': SEARCH_EXCLUSIONS['bank'],
};

/**
 * Specific account codes for common FP&A queries
 * These match exactly what Rillet reports in each category
 */
const ACCOUNT_CODE_LISTS = {
  'cash': [
    '11001', // JP Morgan Checking
    '11003', // JP Morgan Treasury Money Market Fund
    '11016', // Shopify Funds Clearing (Fondue)
    '11017', // SVB Checking Account - 6930 (Fondue)
    '11018', // MESH - Company Account
    '11023', // PayPal
    '11024', // SVB Savings (2520)
    '11028', // Stripe Money in Transit (Postscript)
    '11029', // Shopify Money in Transit (Postscript)
    '11031', // JP Morgan Prime Money Market Fund
    '11033', // Petty cash
    '11034', // Poalim Bank Nis.
    '11035', // Poalim Bank $
  ],
};

/**
 * Find accounts matching a query
 * @param {object} criteria - Search criteria
 * @param {string} criteria.search - Text to search in name (case-insensitive)
 * @param {string} criteria.type - Account type (ASSET, LIABILITY, EQUITY, EXPENSE, INCOME)
 * @param {string} criteria.subtype - Account subtype (e.g., "Cash", "Bank")
 * @param {string[]} criteria.codes - Specific account codes
 */
async function findAccounts(criteria = {}) {
  const accounts = await getAllAccounts();
  let { search, type, subtype, codes } = criteria;
  let subtypes = null; // Can be array for multi-subtype matching
  let exclusions = null; // Account name patterns to exclude
  const originalSearch = search; // Keep track of original search for exclusions

  // Smart mapping: if search term maps to known account codes or subtypes
  if (search && !subtype && (!codes || codes.length === 0)) {
    const searchLower = search.toLowerCase().trim();

    // First check if we have a specific list of account codes for this search term
    if (ACCOUNT_CODE_LISTS[searchLower]) {
      codes = ACCOUNT_CODE_LISTS[searchLower];
      console.log(`[Workflow] Using specific account codes for "${search}": ${codes.join(', ')}`);
      search = null; // Clear search since we're using codes
    }
    // Otherwise, map to subtypes
    else {
      const mapped = SEARCH_TO_SUBTYPE_MAP[searchLower];
      if (mapped) {
        subtypes = Array.isArray(mapped) ? mapped : [mapped];
        console.log(`[Workflow] Mapping search "${search}" to subtypes: ${subtypes.join(', ')}`);

        // Check for exclusions for this search term
        exclusions = SEARCH_EXCLUSIONS[searchLower];
        if (exclusions) {
          console.log(`[Workflow] Excluding accounts with names containing: ${exclusions.join(', ')}`);
        }

        search = null; // Clear search since we're using subtype
      }
    }
  }

  // If subtype was explicitly provided, use it
  if (subtype && !subtypes) {
    subtypes = [subtype];

    // Also check for exclusions when subtype is directly specified
    const subtypeLower = subtype.toLowerCase().trim();
    if (SUBTYPE_EXCLUSIONS[subtypeLower]) {
      exclusions = SUBTYPE_EXCLUSIONS[subtypeLower];
      console.log(`[Workflow] Subtype "${subtype}" has exclusions: ${exclusions.join(', ')}`);
    }
  }

  return accounts.filter(acc => {
    // Filter by specific codes
    if (codes && codes.length > 0) {
      if (!codes.includes(acc.code)) return false;
    }

    // Filter by type (exact match)
    if (type) {
      if (acc.type?.toUpperCase() !== type.toUpperCase()) return false;
    }

    // Filter by subtype(s) (exact match, case-insensitive)
    if (subtypes && subtypes.length > 0) {
      const accSubtype = (acc.subtype || '').toLowerCase();
      const matches = subtypes.some(st => st.toLowerCase() === accSubtype);
      if (!matches) return false;
    }

    // Apply exclusions (e.g., exclude "receivables" from cash queries)
    if (exclusions && exclusions.length > 0) {
      const nameLower = (acc.name || '').toLowerCase();
      for (const exclusion of exclusions) {
        if (nameLower.includes(exclusion.toLowerCase())) {
          return false; // Exclude this account
        }
      }
    }

    // Filter by name search (only if not already matched by subtype)
    if (search) {
      const searchLower = search.toLowerCase();
      const nameLower = (acc.name || '').toLowerCase();

      // Exclude negations (e.g., "non-cash" when searching for "cash")
      if (nameLower.includes('non-' + searchLower) || nameLower.includes('non ' + searchLower)) {
        return false;
      }

      const nameMatch = nameLower.includes(searchLower);
      const codeMatch = acc.code?.includes(search);
      if (!nameMatch && !codeMatch) return false;
    }

    // Only active accounts
    if (acc.status !== 'ACTIVE') return false;

    return true;
  });
}

/**
 * In-memory cache (used as L1 cache, Postgres as L2)
 */
let memoryCache = null;
let memoryCacheTime = null;
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for memory cache

/**
 * Get balances from Postgres cache
 * Returns null if no cache or cache is stale (> 24 hours)
 */
async function getBalancesFromDB() {
  try {
    const cached = await dbCache.getBalanceCache();
    if (!cached) return null;

    // Consider cache stale after 24 hours
    const MAX_AGE_HOURS = 24;
    if (cached.age_hours > MAX_AGE_HOURS) {
      console.log(`[Workflow] DB cache is ${cached.age_hours}h old (max ${MAX_AGE_HOURS}h), needs refresh`);
      return null;
    }

    return cached.balances;
  } catch (error) {
    console.error('[Workflow] Error reading DB cache:', error.message);
    return null;
  }
}

/**
 * Save balances to Postgres cache
 */
async function saveBalancesToDB(balances) {
  try {
    await dbCache.setBalanceCache(balances);
  } catch (error) {
    console.error('[Workflow] Error saving to DB cache:', error.message);
  }
}

/**
 * Calculate balances for ALL accounts
 * Uses L1 (memory) -> L2 (Postgres) -> Rillet (slow) fallback
 */
async function getAllAccountBalances(forceRefresh = false) {
  const now = Date.now();

  // L1: Check memory cache first (fastest)
  if (!forceRefresh && memoryCache && memoryCacheTime && (now - memoryCacheTime) < MEMORY_CACHE_TTL) {
    const cacheAge = Math.round((now - memoryCacheTime) / 1000);
    console.log(`[Workflow] Using memory cache (${cacheAge}s old, ${Object.keys(memoryCache).length} accounts)`);
    return memoryCache;
  }

  // L2: Check Postgres cache (fast)
  if (!forceRefresh) {
    const dbBalances = await getBalancesFromDB();
    if (dbBalances) {
      // Populate memory cache from DB
      memoryCache = dbBalances;
      memoryCacheTime = now;
      console.log(`[Workflow] Loaded ${Object.keys(dbBalances).length} accounts from Postgres cache`);
      return dbBalances;
    }
  }

  // L3: Calculate from Rillet (slow - only on refresh or empty cache)
  console.log('[Workflow] Calculating balances from Rillet (this takes ~2 minutes)...');

  const accounts = await getAllAccounts();
  const accountsMap = {};
  for (const acc of accounts) {
    accountsMap[acc.code] = acc;
  }

  // Initialize balances for ALL accounts
  const balances = {};
  for (const acc of accounts) {
    balances[acc.code] = { debits: 0, credits: 0, transactions: 0 };
  }

  // Paginate through ALL journal entries
  let cursor = null;
  let pageCount = 0;
  let totalEntries = 0;
  const maxPages = 500;

  const startTime = Date.now();

  do {
    const data = await rilletFetch('/journal-entries', {
      limit: 100,
      cursor: cursor
    });

    pageCount++;
    const entries = data.journal_entries || [];
    totalEntries += entries.length;

    // Process ALL journal entry items
    for (const entry of entries) {
      for (const item of entry.items || []) {
        const itemCode = item.account_code;
        if (itemCode && balances[itemCode]) {
          const amount = parseFloat(item.amount?.amount || 0);
          if (item.side === 'DEBIT') {
            balances[itemCode].debits += amount;
          } else if (item.side === 'CREDIT') {
            balances[itemCode].credits += amount;
          }
          balances[itemCode].transactions++;
        }
      }
    }

    cursor = data.pagination?.next_cursor || null;

    if (pageCount % 20 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[Workflow] Progress: ${pageCount} pages, ${totalEntries} entries, ${elapsed}s elapsed...`);
    }
  } while (cursor && pageCount < maxPages);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[Workflow] Finished: ${pageCount} pages, ${totalEntries} entries in ${elapsed}s`);

  // Calculate final balances with account metadata
  const results = {};
  for (const code of Object.keys(balances)) {
    const acc = accountsMap[code] || {};
    const b = balances[code];

    // Liability/Equity/Revenue = credits - debits, Assets/Expenses = debits - credits
    const isCredit = ['LIABILITY', 'EQUITY', 'REVENUE', 'INCOME'].includes((acc.type || '').toUpperCase());
    const balance = isCredit ? (b.credits - b.debits) : (b.debits - b.credits);

    results[code] = {
      code,
      name: acc.name || 'Unknown',
      type: acc.type || 'Unknown',
      subtype: acc.subtype || 'Unknown',
      debits: b.debits,
      credits: b.credits,
      balance,
      transactions: b.transactions
    };
  }

  // Save to both caches
  memoryCache = results;
  memoryCacheTime = now;
  await saveBalancesToDB(results);

  console.log(`[Workflow] Cached ${Object.keys(results).length} accounts to memory + Postgres`);

  return results;
}

/**
 * Get balances for specific account codes (uses cache)
 */
async function calculateBalances(accountCodes) {
  if (!accountCodes || accountCodes.length === 0) {
    return {};
  }

  // Get all balances from cache
  const allBalances = await getAllAccountBalances();

  // Return only requested accounts
  const results = {};
  for (const code of accountCodes) {
    if (allBalances[code]) {
      results[code] = allBalances[code];
    }
  }

  return results;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// ============================================================================
// WORKFLOW: Account Balance
// ============================================================================

/**
 * Get account balances workflow
 *
 * This workflow:
 * 1. Looks up accounts matching the criteria (by name, type, subtype, or codes)
 * 2. Fetches all journal entries from Rillet
 * 3. Calculates balances for each matched account
 * 4. Returns formatted results with totals
 *
 * @param {object} input
 * @param {string} input.search - Search accounts by name (e.g., "cash", "SLW", "payroll")
 * @param {string} input.type - Filter by account type (ASSET, LIABILITY, EQUITY, EXPENSE, INCOME)
 * @param {string} input.subtype - Filter by subtype (e.g., "Cash", "Bank", "Accounts Receivable")
 * @param {string[]} input.codes - Specific account codes to query
 */
async function accountBalance(input = {}) {
  const { search, type, subtype, codes } = input;

  // Validate input - need at least one filter
  if (!search && !type && !subtype && (!codes || codes.length === 0)) {
    return {
      error: 'Please provide at least one filter: search (account name), type, subtype, or codes',
      is_error: true,
      hint: 'Examples: { search: "cash" }, { type: "LIABILITY" }, { subtype: "Bank" }, { codes: ["11001", "11002"] }'
    };
  }

  try {
    // Step 1: Find matching accounts
    console.log(`[Workflow:accountBalance] Finding accounts matching: ${JSON.stringify(input)}`);
    const matchedAccounts = await findAccounts({ search, type, subtype, codes });

    if (matchedAccounts.length === 0) {
      return {
        error: 'No accounts found matching your criteria',
        is_error: true,
        criteria: input,
        hint: 'Try a broader search or check account names in Rillet'
      };
    }

    console.log(`[Workflow:accountBalance] Found ${matchedAccounts.length} accounts:`);
    matchedAccounts.forEach(a => {
      console.log(`  - ${a.code}: ${a.name} (type=${a.type}, subtype=${a.subtype})`);
    });

    // Step 2: Calculate balances for matched accounts
    const accountCodes = matchedAccounts.map(a => a.code);
    const balances = await calculateBalances(accountCodes);

    // Step 3: Format results
    const results = Object.values(balances).map(b => ({
      ...b,
      formatted_balance: formatCurrency(b.balance)
    }));

    // Sort by absolute balance descending
    results.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    const totalBalance = results.reduce((sum, r) => sum + r.balance, 0);

    return {
      workflow: 'account_balance',
      criteria: input,
      accounts_found: results.length,
      accounts: results,
      total_balance: totalBalance,
      formatted_total: formatCurrency(totalBalance),
      summary: `Found ${results.length} accounts matching "${search || type || subtype || 'specified codes'}". Total balance: ${formatCurrency(totalBalance)}`
    };

  } catch (error) {
    console.error('[Workflow:accountBalance] Error:', error);
    return {
      error: `Workflow failed: ${error.message}`,
      is_error: true,
      criteria: input
    };
  }
}

// ============================================================================
// WORKFLOW: List Account Categories
// ============================================================================

/**
 * List all account categories/subtypes to help users find the right accounts
 */
async function listAccountCategories() {
  try {
    const accounts = await getAllAccounts();

    // Group by type and subtype
    const categories = {};
    for (const acc of accounts) {
      if (acc.status !== 'ACTIVE') continue;

      const type = acc.type || 'Unknown';
      const subtype = acc.subtype || 'Other';

      if (!categories[type]) {
        categories[type] = {};
      }
      if (!categories[type][subtype]) {
        categories[type][subtype] = [];
      }
      categories[type][subtype].push({
        code: acc.code,
        name: acc.name
      });
    }

    // Format for readability
    const summary = {};
    for (const [type, subtypes] of Object.entries(categories)) {
      summary[type] = {};
      for (const [subtype, accs] of Object.entries(subtypes)) {
        summary[type][subtype] = {
          count: accs.length,
          accounts: accs.slice(0, 5), // First 5 as examples
          more: accs.length > 5 ? accs.length - 5 : 0
        };
      }
    }

    return {
      workflow: 'list_account_categories',
      total_accounts: accounts.filter(a => a.status === 'ACTIVE').length,
      categories: summary,
      hint: 'Use these categories with account_balance workflow. Example: { subtype: "Cash" } or { type: "LIABILITY" }'
    };

  } catch (error) {
    console.error('[Workflow:listAccountCategories] Error:', error);
    return {
      error: `Workflow failed: ${error.message}`,
      is_error: true
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Refresh the balance cache manually
 */
async function refreshBalanceCache() {
  console.log('[Workflow] Force refreshing balance cache...');
  return getAllAccountBalances(true);
}

/**
 * Get cache status (checks both memory and Postgres)
 */
async function getCacheStatus() {
  const now = Date.now();

  // Check memory cache
  const memoryValid = memoryCache && memoryCacheTime && (now - memoryCacheTime) < MEMORY_CACHE_TTL;

  // Check Postgres cache
  const dbStatus = await dbCache.getCacheStatus();

  return {
    memory_cache: memoryValid ? {
      accounts: Object.keys(memoryCache).length,
      age_seconds: Math.round((now - memoryCacheTime) / 1000)
    } : null,
    postgres_cache: dbStatus.cached ? {
      accounts: dbStatus.account_count,
      age_hours: dbStatus.age_hours,
      created_at: dbStatus.created_at
    } : null,
    message: dbStatus.cached
      ? `Postgres cache: ${dbStatus.message}. Queries will be fast.`
      : 'No cache. First query will take ~2 minutes to build cache.'
  };
}

module.exports = {
  accountBalance,
  listAccountCategories,
  refreshBalanceCache,
  getCacheStatus,
  // Helper functions for other workflows
  getAllAccounts,
  getAllAccountBalances,
  findAccounts,
  calculateBalances,
  rilletFetch
};
