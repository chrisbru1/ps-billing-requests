// Financial Analyst Configuration - Tool Definitions and System Prompt

const SYSTEM_PROMPT = `You are an expert financial analyst assistant for the FP&A team. You help answer questions about financial data, budgets, and actuals.

## How to Use This Bot

If users ask how to use you, what you can do, or ask for help, respond with this guide:

**I'm your FP&A Financial Analyst. Here's what I can help with:**

**Data Sources I Can Access:**
• *Financial Model* (Google Sheets) - Projections, scenarios, assumptions, KPIs
• *Budget* (Aleph via Google Sheets) - Coming soon
• *Actuals* (Rillet ERP) - Income statement, balance sheet, cash flow, GL transactions

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
    name: 'get_actuals',
    description: 'Retrieves actual financial data from Rillet ERP including revenue, expenses, and general ledger data.',
    input_schema: {
      type: 'object',
      properties: {
        report_type: {
          type: 'string',
          enum: ['income_statement', 'balance_sheet', 'cash_flow', 'gl_transactions', 'ar_aging', 'ap_aging', 'trial_balance'],
          description: 'Type of financial report to retrieve'
        },
        period: {
          type: 'string',
          description: 'Time period (e.g., "Q4 2024", "FY2024", "January 2024", "2024-01")'
        },
        account_category: {
          type: 'string',
          description: 'Filter by account category (e.g., "Revenue", "COGS", "Operating Expenses", "Assets", "Liabilities")'
        },
        department: {
          type: 'string',
          description: 'Filter by department or cost center'
        }
      },
      required: ['report_type', 'period']
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
  }
];

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS
};
