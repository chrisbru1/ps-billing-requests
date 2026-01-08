// Tool Registry and Executor

const googleSheets = require('./google-sheets');
const rillet = require('./rillet');
const { getRilletMCPClient } = require('./rillet-mcp');

// Map tool names to their implementations
const toolImplementations = {
  // Google Sheets tools
  'get_budget_data': async (input) => googleSheets.getBudgetData(input),
  'get_financial_model': async (input) => googleSheets.getFinancialModel(input),
  'list_available_sheets': async (input) => googleSheets.listAvailableSheets(input),

  // Rillet MCP tools - dynamic discovery and calling
  'list_rillet_tools': async () => {
    const mcpClient = getRilletMCPClient();
    return mcpClient.listTools();
  },
  'call_rillet_tool': async (input) => {
    const mcpClient = getRilletMCPClient();
    return mcpClient.callTool(input.tool_name, input.arguments || {});
  },

  // Rillet REST API tools (fallback)
  'get_arr_waterfall': async (input) => rillet.getARRWaterfall(input),
  'get_journal_entries': async (input) => rillet.getJournalEntries(input),
  'get_chart_of_accounts': async () => rillet.getAccounts(),
  'get_bank_accounts': async (input) => rillet.getBankAccounts(input),

  // Legacy - kept for backward compatibility
  'get_actuals': async (input) => rillet.getActuals(input)
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
