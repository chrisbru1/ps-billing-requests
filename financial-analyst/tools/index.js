// Tool Registry and Executor

const googleSheets = require('./google-sheets');
const rillet = require('./rillet');

// Map tool names to their implementations
const toolImplementations = {
  // Google Sheets tools
  'get_budget_data': async (input) => googleSheets.getBudgetData(input),
  'get_financial_model': async (input) => googleSheets.getFinancialModel(input),
  'list_available_sheets': async (input) => googleSheets.listAvailableSheets(input),

  // Direct Rillet API tool - simpler and more efficient
  'call_rillet_api': async (input) => {
    const { endpoint, params = {} } = input;

    if (!endpoint) {
      return {
        error: 'endpoint is required',
        is_error: true
      };
    }

    // Route to appropriate Rillet method based on endpoint
    if (endpoint === '/accounts' || endpoint === 'accounts') {
      return rillet.getAccounts();
    }

    if (endpoint === '/journal-entries' || endpoint === 'journal-entries') {
      return rillet.getJournalEntries({
        start_date: params.created_at_min,
        end_date: params.created_at_max,
        subsidiary: params.subsidiary
      });
    }

    if (endpoint === '/reports/arr-waterfall' || endpoint === 'reports/arr-waterfall' || endpoint === 'arr-waterfall') {
      return rillet.getARRWaterfall({
        month: params.month,
        status: params.status,
        breakdown: params.breakdown,
        subsidiary: params.subsidiary
      });
    }

    if (endpoint === '/bank-accounts' || endpoint === 'bank-accounts') {
      return rillet.getBankAccounts({
        subsidiary: params.subsidiary
      });
    }

    if (endpoint === '/books/periods/last-closed' || endpoint === 'books/periods/last-closed' || endpoint === 'last-closed-period') {
      return rillet.getLastClosedPeriod();
    }

    // Unknown endpoint
    return {
      error: `Unknown Rillet endpoint: ${endpoint}`,
      is_error: true,
      hint: 'Available endpoints: /accounts, /journal-entries, /reports/arr-waterfall, /bank-accounts, /books/periods/last-closed'
    };
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
