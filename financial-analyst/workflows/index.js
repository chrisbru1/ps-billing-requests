// Financial Analyst Workflows
// High-level orchestrated operations that combine multiple data sources

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
 * Find accounts matching a query
 * @param {object} criteria - Search criteria
 * @param {string} criteria.search - Text to search in name (case-insensitive)
 * @param {string} criteria.type - Account type (ASSET, LIABILITY, EQUITY, EXPENSE, INCOME)
 * @param {string} criteria.subtype - Account subtype (e.g., "Cash", "Bank")
 * @param {string[]} criteria.codes - Specific account codes
 */
async function findAccounts(criteria = {}) {
  const accounts = await getAllAccounts();

  return accounts.filter(acc => {
    // Filter by specific codes
    if (criteria.codes && criteria.codes.length > 0) {
      if (!criteria.codes.includes(acc.code)) return false;
    }

    // Filter by type
    if (criteria.type) {
      if (acc.type?.toUpperCase() !== criteria.type.toUpperCase()) return false;
    }

    // Filter by subtype
    if (criteria.subtype) {
      if (!acc.subtype?.toLowerCase().includes(criteria.subtype.toLowerCase())) return false;
    }

    // Filter by name search
    if (criteria.search) {
      const searchLower = criteria.search.toLowerCase();
      const nameMatch = acc.name?.toLowerCase().includes(searchLower);
      const subtypeMatch = acc.subtype?.toLowerCase().includes(searchLower);
      const codeMatch = acc.code?.includes(criteria.search);
      if (!nameMatch && !subtypeMatch && !codeMatch) return false;
    }

    // Only active accounts
    if (acc.status !== 'ACTIVE') return false;

    return true;
  });
}

/**
 * Calculate balances for given account codes by summing all journal entries
 */
async function calculateBalances(accountCodes) {
  if (!accountCodes || accountCodes.length === 0) {
    return {};
  }

  const accounts = await getAllAccounts();
  const accountsMap = {};
  for (const acc of accounts) {
    accountsMap[acc.code] = acc;
  }

  // Initialize balances
  const balances = {};
  for (const code of accountCodes) {
    balances[code] = { debits: 0, credits: 0, transactions: 0 };
  }

  // Paginate through ALL journal entries
  let cursor = null;
  let pageCount = 0;
  let totalEntries = 0;
  const maxPages = 200; // Higher limit for complete data

  console.log(`[Workflow] Calculating balances for ${accountCodes.length} accounts...`);

  do {
    const data = await rilletFetch('/journal-entries', {
      limit: 100,
      cursor: cursor
    });

    pageCount++;
    const entries = data.journal_entries || [];
    totalEntries += entries.length;

    // Process journal entries
    for (const entry of entries) {
      for (const item of entry.items || []) {
        const itemCode = item.account_code;
        if (itemCode && balances[itemCode] !== undefined) {
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

    if (pageCount % 10 === 0) {
      console.log(`[Workflow] Processed ${pageCount} pages, ${totalEntries} entries...`);
    }
  } while (cursor && pageCount < maxPages);

  console.log(`[Workflow] Finished: ${pageCount} pages, ${totalEntries} total entries`);

  // Calculate final balances with account metadata
  const results = {};
  for (const code of accountCodes) {
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

    console.log(`[Workflow:accountBalance] Found ${matchedAccounts.length} accounts: ${matchedAccounts.map(a => a.code).join(', ')}`);

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

module.exports = {
  accountBalance,
  listAccountCategories,
  // Helper functions for other workflows
  getAllAccounts,
  findAccounts,
  calculateBalances,
  rilletFetch
};
