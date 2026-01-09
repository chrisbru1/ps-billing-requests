// Tool Registry and Executor

const googleSheets = require('./google-sheets');
const { getRilletMCPClient } = require('./rillet-mcp');

// Rillet API base URL
const RILLET_API_BASE = process.env.RILLET_API_BASE_URL || 'https://api.rillet.com';

/**
 * Fetch all pages of journal entries from Rillet and calculate account balances
 */
async function calculateAccountBalances(accountCodes) {
  const apiKey = process.env.RILLET_API_KEY;
  if (!apiKey) {
    return { error: 'RILLET_API_KEY not configured', is_error: true };
  }

  console.log(`[Rillet] Calculating balances for accounts: ${accountCodes.join(', ')}`);

  // First get accounts to map codes to names/types
  const accountsResponse = await fetch(`${RILLET_API_BASE}/accounts`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const accountsData = await accountsResponse.json();
  const accountsMap = {};
  for (const acc of accountsData.accounts || []) {
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
  const maxPages = 100; // Safety limit

  do {
    const url = new URL(`${RILLET_API_BASE}/journal-entries`);
    url.searchParams.append('limit', '100');
    if (cursor) url.searchParams.append('cursor', cursor);

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await response.json();
    pageCount++;

    console.log(`[Rillet] Fetched page ${pageCount}, entries: ${data.journal_entries?.length || 0}`);

    // Process journal entries
    for (const entry of data.journal_entries || []) {
      for (const line of entry.lines || []) {
        const lineCode = line.account?.code;
        if (lineCode && accountCodes.includes(lineCode)) {
          balances[lineCode].debits += parseFloat(line.debit || 0);
          balances[lineCode].credits += parseFloat(line.credit || 0);
          balances[lineCode].transactions++;
        }
      }
    }

    cursor = data.pagination?.next_cursor || null;
  } while (cursor && pageCount < maxPages);

  // Calculate final balances
  const results = [];
  for (const code of accountCodes) {
    const acc = accountsMap[code] || {};
    const b = balances[code];

    // Liability/Equity/Revenue = credits - debits, Assets/Expenses = debits - credits
    const isCredit = ['LIABILITY', 'EQUITY', 'REVENUE', 'INCOME'].includes((acc.type || '').toUpperCase());
    const balance = isCredit ? (b.credits - b.debits) : (b.debits - b.credits);

    results.push({
      code,
      name: acc.name || 'Unknown',
      type: acc.type || 'Unknown',
      debits: b.debits,
      credits: b.credits,
      balance,
      transactions: b.transactions
    });
  }

  const total = results.reduce((sum, r) => sum + r.balance, 0);

  return {
    source: 'Rillet (all journal entries)',
    pages_fetched: pageCount,
    accounts: results,
    total_balance: total,
    formatted_total: formatCurrency(total)
  };
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// Map tool names to their implementations
const toolImplementations = {
  // Google Sheets tools
  'get_budget_data': async (input) => googleSheets.getBudgetData(input),
  'get_financial_model': async (input) => googleSheets.getFinancialModel(input),
  'list_available_sheets': async (input) => googleSheets.listAvailableSheets(input),

  // Account balance calculator - handles pagination properly
  'get_account_balances': async (input) => {
    const { account_codes } = input;
    if (!account_codes || !Array.isArray(account_codes) || account_codes.length === 0) {
      return { error: 'account_codes array is required', is_error: true };
    }
    return calculateAccountBalances(account_codes);
  },

  // Direct Rillet API via MCP execute-request
  'call_rillet_api': async (input) => {
    const { method = 'GET', endpoint, params = {}, body } = input;

    if (!endpoint) {
      return {
        error: 'endpoint is required',
        is_error: true
      };
    }

    // Build the full URL with query params
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = new URL(`${RILLET_API_BASE}${cleanEndpoint}`);

    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    // Build HAR request with auth header
    const harRequest = {
      method: method.toUpperCase(),
      url: url.toString(),
      headers: [
        { name: 'Authorization', value: `Bearer ${process.env.RILLET_API_KEY}` },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Accept', value: 'application/json' }
      ]
    };

    // Add body for POST/PUT/PATCH requests
    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      harRequest.postData = {
        mimeType: 'application/json',
        text: JSON.stringify(body)
      };
    }

    // Use MCP's execute-request to make the actual API call
    const mcpClient = getRilletMCPClient();
    return mcpClient.callTool('execute-request', { harRequest });
  }
};

/**
 * Execute a tool by name with the given input
 * @param {string} name - Tool name
 * @param {object} input - Tool input parameters
 * @returns {Promise<object>} - Tool result
 */
async function execute(name, input) {
  const tool = toolImplementations[name];

  if (!tool) {
    return {
      error: `Unknown tool: ${name}`,
      is_error: true,
      available_tools: Object.keys(toolImplementations)
    };
  }

  try {
    console.log(`Executing tool: ${name}`, JSON.stringify(input));
    const result = await tool(input);
    console.log(`Tool ${name} completed:`, result.is_error ? result.error : 'success');
    return result;
  } catch (error) {
    console.error(`Tool ${name} error:`, error);
    return {
      error: `Tool execution failed: ${error.message}`,
      is_error: true,
      tool_name: name,
      input
    };
  }
}

/**
 * Get list of available tool names
 * @returns {string[]}
 */
function getAvailableTools() {
  return Object.keys(toolImplementations);
}

module.exports = {
  execute,
  getAvailableTools
};
