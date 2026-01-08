// Rillet MCP Client - Connects to Rillet's MCP server for financial data

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { ListToolsResultSchema, CallToolResultSchema } = require('@modelcontextprotocol/sdk/types.js');

class RilletMCPClient {
  constructor() {
    this.mcpUrl = process.env.RILLET_MCP_URL || 'https://docs.api.rillet.com/mcp';
    this.apiKey = process.env.RILLET_API_KEY;
    this.client = null;
    this.transport = null;
    this.tools = [];
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    if (!this.apiKey) {
      throw new Error('RILLET_API_KEY not configured');
    }

    console.log(`[Rillet MCP] Connecting to ${this.mcpUrl}...`);

    try {
      this.client = new Client(
        { name: 'fpa-bot', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      // Try StreamableHTTP first, fall back to SSE
      try {
        this.transport = new StreamableHTTPClientTransport(
          new URL(this.mcpUrl),
          {
            requestInit: {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`
              }
            }
          }
        );
        await this.client.connect(this.transport);
      } catch (httpError) {
        console.log('[Rillet MCP] StreamableHTTP failed, trying SSE...', httpError.message);

        // Fall back to SSE transport
        this.transport = new SSEClientTransport(
          new URL(this.mcpUrl),
          {
            requestInit: {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`
              }
            }
          }
        );
        await this.client.connect(this.transport);
      }

      // List available tools
      const toolsResult = await this.client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema
      );

      this.tools = toolsResult.tools;
      this.connected = true;

      console.log('[Rillet MCP] Connected! Available tools:', this.tools.map(t => t.name));
      return this.tools;

    } catch (error) {
      console.error('[Rillet MCP] Connection failed:', error.message);
      this.connected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
    }
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  async listTools() {
    try {
      await this.connect();
      return {
        source: 'Rillet MCP',
        tools: this.tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      };
    } catch (error) {
      return {
        error: `Failed to list Rillet MCP tools: ${error.message}`,
        is_error: true
      };
    }
  }

  async callTool(toolName, args = {}) {
    try {
      await this.connect();

      console.log(`[Rillet MCP] Calling tool: ${toolName}`, args);

      const result = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args
          }
        },
        CallToolResultSchema
      );

      // Extract text content from result
      const textContent = result.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      return {
        source: 'Rillet MCP',
        tool: toolName,
        args,
        result: textContent || result.content,
        raw: result
      };

    } catch (error) {
      return {
        error: `Rillet MCP tool call failed: ${error.message}`,
        is_error: true,
        tool: toolName,
        args
      };
    }
  }

  // Convenience methods that map to common Rillet MCP tools
  // These will be populated based on what tools Rillet actually exposes

  async getAccountBalances(params = {}) {
    return this.callTool('get_account_balances', params);
  }

  async getTrialBalance(params = {}) {
    return this.callTool('get_trial_balance', params);
  }

  async getIncomeStatement(params = {}) {
    return this.callTool('get_income_statement', params);
  }

  async getBalanceSheet(params = {}) {
    return this.callTool('get_balance_sheet', params);
  }

  async query(question) {
    // Generic query tool if Rillet exposes one
    return this.callTool('query', { question });
  }
}

// Singleton instance
let instance = null;

function getRilletMCPClient() {
  if (!instance) {
    instance = new RilletMCPClient();
  }
  return instance;
}

module.exports = {
  RilletMCPClient,
  getRilletMCPClient
};
