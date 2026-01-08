// Financial Analyst Configuration - Tool Definitions and System Prompt

const SYSTEM_PROMPT = `You are an expert financial analyst assistant for the FP&A team. You help answer questions about financial data, budgets, and actuals.

## How to Use This Bot

If users ask how to use you, what you can do, or ask for help, respond with this guide:

**I'm your FP&A Financial Analyst. Here's what I can help with:**

**Data Sources I Can Access:**
• *Financial Model* (Google Sheets) - Projections, scenarios, assumptions, KPIs
• *Budget* (Aleph via Google Sheets) - Coming soon
• *Rillet ERP* - ARR waterfall, journal entries, chart of accounts, bank accounts

**Example Questions You Can Ask:**
• "What are our revenue projections for Q1?"
• "Show me the assumptions in our financial model"
• "What's in the financial model?"
• "Compare our Q4 actuals to budget"
• "What's our current cash position?"
• "Show me operating expenses by department"
• "What are the key KPIs in our model?"

**Tips:**
• Be specific about time periods (Q4 2024, FY2025, January 2024)
• Mention the data source if you know it (model, budget, actuals)
• Ask follow-up questions - I remember our conversation in this thread

---

You have access to these data sources through tools:
1. **Budget data** from Google Sheets (synced from Aleph FP&A)
2. **Financial model** data from Google Sheets (projections, scenarios, assumptions)
3. **Actuals** from Rillet ERP (income statement, balance sheet, GL transactions, etc.)

## Guidelines

### Data Retrieval
- Use the appropriate tool to fetch data before answering questions
- If a question requires data from multiple sources, fetch from all relevant sources
- Always verify you have the data before making claims

### Analysis & Presentation
- Present numbers with proper formatting ($X.XM for millions, $XK for thousands, X% for percentages)
- When comparing budget vs actuals, always calculate and clearly state variances (both absolute and percentage)
- Use tables for comparisons when it helps clarity
- Be concise but thorough - focus on insights, not just data

### Uncertainty & Limitations
- If data is unavailable or incomplete, say so clearly
- If you're uncertain about an interpretation, state your assumptions
- Don't make up numbers - only report what the tools return

### Financial Conventions
- Use standard accounting terminology
- Positive variances generally mean actuals exceeded budget (favorable for revenue, unfavorable for expenses)
- Reference the specific data source (sheet name, report type) in your answers

When presenting financial comparisons, use this format:
| Metric | Budget | Actual | Variance ($) | Variance (%) |
|--------|--------|--------|--------------|--------------|
`;

const TOOL_DEFINITIONS = [
  {
    name: 'get_budget_data',
    description: 'Retrieves budget data from Google Sheets (synced from Aleph FP&A). Use this to get planned/budgeted figures for revenue, expenses, headcount, etc.',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          description: 'The budget metric to retrieve (e.g., "revenue", "cogs", "opex", "headcount", "gross_margin", "ebitda", "net_income")'
        },
        period: {
          type: 'string',
          description: 'Time period (e.g., "Q4 2024", "FY2024", "January 2024", "2024")'
        },
        department: {
          type: 'string',
          description: 'Optional department filter (e.g., "Engineering", "Sales", "Marketing", "G&A")'
        },
        sheet_name: {
          type: 'string',
          description: 'Optional specific sheet tab name to query. If not specified, queries the default budget summary sheet.'
        }
      },
      required: ['metric', 'period']
    }
  },
  {
    name: 'get_financial_model',
    description: 'Retrieves data from the financial model spreadsheet including projections, scenarios, and key assumptions.',
    input_schema: {
      type: 'object',
      properties: {
        data_type: {
          type: 'string',
          enum: ['projection', 'scenario', 'assumptions', 'summary', 'kpis'],
          description: 'Type of financial model data to retrieve'
        },
        scenario: {
          type: 'string',
          description: 'Scenario name (e.g., "base", "upside", "downside", "conservative")'
        },
        metric: {
          type: 'string',
          description: 'Specific metric or KPI to retrieve (e.g., "arr", "mrr", "burn_rate", "runway")'
        },
        period: {
          type: 'string',
          description: 'Time period for the data (e.g., "Q4 2024", "FY2025")'
        }
      },
      required: ['data_type']
    }
  },
  {
    name: 'get_arr_waterfall',
    description: 'Retrieves ARR (Annual Recurring Revenue) waterfall report from Rillet showing MRR/ARR changes over time including new, expansion, contraction, and churn.',
    input_schema: {
      type: 'object',
      properties: {
        month: {
          type: 'string',
          description: 'Month for the report (e.g., "December 2024", "2024-12", "Q4 2024" for last month of quarter)'
        },
        status: {
          type: 'string',
          description: 'Filter by status'
        },
        breakdown: {
          type: 'string',
          description: 'How to break down the data'
        }
      },
      required: ['month']
    }
  },
  {
    name: 'get_journal_entries',
    description: 'Retrieves journal entries from Rillet ERP. Use this for detailed transaction-level accounting data.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date filter (ISO format: 2024-01-01)'
        },
        end_date: {
          type: 'string',
          description: 'End date filter (ISO format: 2024-12-31)'
        }
      },
      required: []
    }
  },
  {
    name: 'get_chart_of_accounts',
    description: 'Retrieves the chart of accounts from Rillet ERP. Use this to see all account categories and structure.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_bank_accounts',
    description: 'Retrieves bank account information from Rillet ERP.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'list_rillet_tools',
    description: 'Discovers all available tools from Rillet MCP server. Use this FIRST to see what financial data and reports are available from Rillet before calling specific tools. This will show you tools for balance sheets, income statements, account balances, and more.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'call_rillet_tool',
    description: 'Calls a specific Rillet MCP tool by name. Use list_rillet_tools first to discover available tools and their parameters. This allows access to financial reports, account balances, and other data from Rillet.',
    input_schema: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'The name of the Rillet MCP tool to call (from list_rillet_tools)'
        },
        arguments: {
          type: 'object',
          description: 'Arguments to pass to the tool (based on the tool\'s input schema from list_rillet_tools)'
        }
      },
      required: ['tool_name']
    }
  },
  {
    name: 'list_available_sheets',
    description: 'Lists all available Google Sheets and their tabs. Use this to discover what budget and model data is available.',
    input_schema: {
      type: 'object',
      properties: {
        sheet_type: {
          type: 'string',
          enum: ['budget', 'model', 'all'],
          description: 'Which spreadsheet(s) to list tabs from'
        }
      },
      required: ['sheet_type']
    }
  },
  {
    name: 'calculate_account_balance',
    description: 'Calculates the balance for a specific account by summing all debits and credits from journal entries. Use this to find current balances for liability accounts (like SLW), asset accounts, or any GL account. This is the PRIMARY tool for getting account balances since Rillet does not have a direct balance endpoint.',
    input_schema: {
      type: 'object',
      properties: {
        account_code: {
          type: 'string',
          description: 'The account code to look up (e.g., "24000", "10100")'
        },
        account_name: {
          type: 'string',
          description: 'Search by account name instead of code (e.g., "SLW", "Cash", "Accounts Payable")'
        },
        as_of_date: {
          type: 'string',
          description: 'Calculate balance as of this date (ISO format: 2024-12-31). If not provided, calculates all-time balance.'
        }
      },
      required: []
    }
  },
  {
    name: 'calculate_trial_balance',
    description: 'Generates a trial balance by calculating balances for all accounts from journal entries. Use this to see all account balances at once, verify debits equal credits, or get an overview of the general ledger. Can filter by account type.',
    input_schema: {
      type: 'object',
      properties: {
        as_of_date: {
          type: 'string',
          description: 'Calculate trial balance as of this date (ISO format: 2024-12-31)'
        },
        account_type: {
          type: 'string',
          description: 'Filter to specific account type (e.g., "LIABILITY", "ASSET", "EQUITY", "REVENUE", "EXPENSE")'
        }
      },
      required: []
    }
  }
];

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS
};
