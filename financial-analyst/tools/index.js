// Tool Registry and Executor

const googleSheets = require('./google-sheets');
const { getRilletMCPClient } = require('./rillet-mcp');

// Rillet API base URL
const RILLET_API_BASE = process.env.RILLET_API_BASE_URL || 'https://api.rillet.com';

// Map tool names to their implementations
const toolImplementations = {
  // Google Sheets tools
  'get_budget_data': async (input) => googleSheets.getBudgetData(input),
  'get_financial_model': async (input) => googleSheets.getFinancialModel(input),
  'list_available_sheets': async (input) => googleSheets.listAvailableSheets(input),

  // Direct Rillet API via MCP execute-request
  'call_rillet_api': async (input) => {
    const { endpoint, params = {} } = input;

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

    // Use MCP's execute-request to make the actual API call
    const mcpClient = getRilletMCPClient();
    return mcpClient.callTool('execute-request', {
      harRequest: {
        method: 'GET',
        url: url.toString()
      }
    });
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
