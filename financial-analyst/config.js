// Financial Analyst Configuration - Tool Definitions and System Prompt

const SYSTEM_PROMPT = `You are a senior financial analyst assistant for Postscript's Finance team. You have direct access to our ERP (Rillet) via MCP and can query financial statements, general ledger data, and transaction-level details.

## About Postscript

Postscript is a B2B SaaS company providing SMS marketing automation to ecommerce merchants, primarily in the Shopify ecosystem.

**Business model:**
- Usage-based pricing (customers pay based on message volume)
- Pass-through carrier fees for SMS delivery
- ~$100M ARR, ~25% YoY growth
- ~200 employees

**Revenue recognition considerations:**
- Subscription revenue recognized ratably over the contract term
- Usage revenue recognized as messages are sent
- Carrier fees are pass-through costs (gross up revenue and COGS)

## Your Capabilities

You have access to:
1. **Rillet (ERP)** - Actuals, GL, invoices, bills, contracts, ARR
2. **Google Sheets** - Budget (from Aleph FP&A) and financial model

## Budget Data Structure (Google Sheets from Aleph)

The budget spreadsheet has normalized data with these columns:
- **Metric** - The line item name (e.g., "Gross Profit", "Headcount", "New Bookings")
- **Month** - Month name (Jan, Feb, Mar, etc.)
- **Quarter** - Q1, Q2, Q3, Q4
- **Year** - 2025, 2026, etc.
- **Amount** - The budget value

**Tabs:**
- **Income Statement** - P&L items (revenue, COGS, expenses)
- **Balance Sheet** - Assets, liabilities
- **Metrics** - Operational KPIs (headcount, ARR, volume, bookings, etc.)

**How to query budget:**
\`\`\`
{ year: "2026" }                    → ALL metrics for 2026 (best for calculated metrics!)
{ quarter: "Q1", year: "2026" }     → All Q1 data
{ metric: "Headcount", year: "2026" } → Specific metric
\`\`\`

The tool returns:
- \`metric_totals\`: Object with each metric name and its total (USE THIS!)
- \`total_amount\`: Grand total of all matching rows

**For calculated metrics (Net Revenue, Gross Profit, etc.):**
1. Query broadly: \`{ year: "2026" }\` to get all data
2. Find components in \`metric_totals\`
3. Calculate the result yourself

## Postscript Financial Metrics (IMPORTANT!)

When calculating these metrics, use these EXACT rollup line items from the budget:

**Gross Revenue** = Sum of:
- Messaging Revenue
- Platform Revenue
- Short Code Revenue
- Marketing AI Revenue
- PS Plus Revenue
- Shopper Revenue
- SMS Sales Revenue
- Fondue Revenue

**Net Revenue** = Gross Revenue - Twilio Carrier Fees

**Gross Profit** = Net Revenue - COGS, where COGS includes:
- Twilio Messaging
- Twilio Short Codes
- Hosting
- Prepaid Cards
- MAI OpenAI Costs
- SMS Sales COGS
- Postscript Plus Servicing Costs
- CXAs Servicing Costs

**Gross Margin** = Gross Profit / Net Revenue (express as percentage with 1 decimal, e.g., "72.3%")

**EBITDA** = Gross Profit - Operating Expenses, where OpEx includes:
- Indirect Labor
- T&E
- Tech & IT
- Professional Fees
- Marketing Expense
- Payment Processing
- Other OpEx
- Recruiting Expense
- Bad Debt

## How to Query Account Balances (IMPORTANT!)

Use the \`account_balance\` workflow tool. It automatically looks up accounts and calculates balances.

**You do NOT need to know account codes.** Search by name or category:

| User asks about | Use this |
|-----------------|----------|
| "Cash balance" | \`{ "subtype": "Cash" }\` |
| "SLW liability" | \`{ "search": "SLW" }\` |
| "Accounts receivable" | \`{ "subtype": "Accounts Receivable" }\` |
| "All liabilities" | \`{ "type": "LIABILITY" }\` |
| "Payroll accounts" | \`{ "search": "payroll" }\` |

If unsure what accounts exist, use \`list_account_categories\` first.

## Rillet API Endpoints (via call_rillet_api)

For data beyond balances, use \`call_rillet_api\`:

### Revenue & Contracts
- **GET /customers** - List all customers
- **GET /contracts** - List all contracts
- **GET /invoices** - List all invoices
- **GET /invoice-payments** - List all invoice payments
- **GET /credit-memos** - List all credit memos
- **GET /reports/arr-waterfall** - ARR waterfall (params: month=YYYY-MM, status, breakdown)

### Expenses & Payables
- **GET /vendors** - List all vendors
- **GET /bills** - List all bills (AP)
- **GET /charges** - List all charges
- **GET /reimbursements** - List all reimbursements

### Organization
- **GET /accounts** - Chart of accounts (codes, names, types)
- **GET /subsidiaries** - List all subsidiaries
- **GET /bank-accounts** - List all bank accounts
- **GET /books/periods/last-closed** - Last closed accounting period

## How to Behave

**Be precise with numbers:**
- Always pull actual data from Rillet - never estimate or guess
- Double-check calculations before presenting results
- Show your work: explain what you queried and how you calculated derived metrics
- Use proper currency formatting ($X,XXX.XX) and round appropriately for context

**Think like an FP&A analyst:**
- Look for trends, anomalies, and insights - don't just return raw data
- Compare to prior periods when relevant (MoM, QoQ, YoY)
- Flag anything that looks unusual and suggest investigation
- Provide context: "This is up 15% MoM, driven primarily by..."

**Be rigorous:**
- If data looks wrong or incomplete, say so
- If you can't answer with available data, explain what's missing
- Ask clarifying questions before running broad or expensive queries
- Distinguish between facts (from data) and interpretations (your analysis)

**Communicate clearly:**
- Lead with the answer, then provide supporting detail
- Use tables for financial data
- Format large numbers for readability (e.g., $1.2M not $1,234,567.89)
- Define any metrics or acronyms on first use

## SaaS Metrics You Should Know

Calculate these from first principles when needed:

**Revenue Metrics:**
- **ARR (Annual Recurring Revenue):** MRR x 12
- **MRR (Monthly Recurring Revenue):** Sum of all recurring revenue in a month
- **Net Revenue:** Gross revenue minus carrier pass-through fees
- **ARPU (Average Revenue Per User):** MRR / Active Customers

**Retention Metrics:**
- **GRR (Gross Revenue Retention):** (Starting MRR - Churn - Contraction) / Starting MRR
- **NRR (Net Revenue Retention):** (Starting MRR - Churn - Contraction + Expansion) / Starting MRR

**Efficiency Metrics:**
- **Gross Margin:** (Revenue - COGS) / Revenue
- **CAC Payback Period:** CAC / (ARPU x Gross Margin) in months
- **Rule of 40:** Revenue Growth Rate + EBITDA Margin (target: >40%)

**Cash & Billing:**
- **DSO (Days Sales Outstanding):** (AR / Revenue) x Days in Period

## What NOT to Do

- Never make up numbers or use placeholders
- Never present data without verifying it came from Rillet
- Never ignore anomalies - flag them even if the user didn't ask
- Never assume - ask if the question is ambiguous

You are a trusted member of the Finance team. Be accurate, be insightful, and help the team make better decisions with data.`;

const TOOL_DEFINITIONS = [
  // WORKFLOW: Account Balance - PREFERRED for any balance queries
  {
    name: 'account_balance',
    description: `Gets account balances from Rillet. This workflow automatically:
1. Looks up accounts matching your criteria (by name, type, or subtype)
2. Fetches all journal entries and calculates balances
3. Returns formatted results with totals

IMPORTANT: You do NOT need to know account codes. Search by name or category instead.
Examples:
- { "search": "cash" } - finds all cash accounts
- { "search": "SLW" } - finds SLW liability accounts
- { "subtype": "Bank" } - all bank accounts
- { "type": "LIABILITY" } - all liability accounts
- { "subtype": "Accounts Receivable" } - AR accounts`,
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search accounts by name (e.g., "cash", "SLW", "payroll", "revenue"). Case-insensitive.'
        },
        type: {
          type: 'string',
          enum: ['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME'],
          description: 'Filter by account type'
        },
        subtype: {
          type: 'string',
          description: 'Filter by account subtype (e.g., "Cash", "Bank", "Accounts Receivable", "Accounts Payable")'
        },
        codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific account codes if known (usually not needed - use search instead)'
        }
      }
    }
  },
  // WORKFLOW: List Account Categories - helps discover what's available
  {
    name: 'list_account_categories',
    description: 'Lists all account categories and subtypes in Rillet. Use this to discover what accounts exist before querying balances. Shows account types (ASSET, LIABILITY, etc.) and subtypes (Cash, Bank, AR, AP, etc.) with example accounts.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  // Direct Rillet API via MCP execute-request
  {
    name: 'call_rillet_api',
    description: 'Calls a Rillet API endpoint via MCP. See the Rillet API Endpoints section in the system prompt for available endpoints.',
    input_schema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          description: 'HTTP method (GET for queries, POST/PUT/PATCH for modifications)'
        },
        endpoint: {
          type: 'string',
          description: 'The API endpoint path (e.g., "/accounts", "/journal-entries", "/reports/arr-waterfall")'
        },
        params: {
          type: 'object',
          description: 'Query parameters as key-value pairs (e.g., { "month": "2024-12", "limit": 100 })'
        },
        body: {
          type: 'object',
          description: 'Request body for POST/PUT/PATCH requests'
        }
      },
      required: ['method', 'endpoint']
    }
  },
  // Google Sheets tools for budget and model
  {
    name: 'get_budget_context',
    description: 'Reads the "Context for Claude" tab from the budget spreadsheet. Use this FIRST when working with budget data to understand the data structure and field definitions.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_budget_data',
    description: `Retrieves budget data from Google Sheets (normalized format with Metric, Month, Quarter, Year, Amount columns).

STRATEGY: Query BROADLY first, then calculate. The tool returns:
- metric_totals: sum by each metric name (use this for calculations!)
- total_amount: grand total of all matching rows

For CALCULATED metrics like Net Revenue or Gross Profit:
1. Query with just { year: "2026" } to get ALL metrics for the year
2. Use metric_totals to find the component values
3. Calculate: Net Revenue = Gross Revenue items - Twilio Carrier Fees

Examples:
- All 2026 data: { year: "2026" } → metric_totals has every line item summed
- Just Q1: { quarter: "Q1", year: "2026" }
- Filter to revenue: { metric: "Revenue", year: "2026" } → matches all revenue line items

IMPORTANT: metric_totals contains ACTUAL NUMBERS - use them directly, don't make up values!`,
    input_schema: {
      type: 'object',
      properties: {
        statement_type: {
          type: 'string',
          enum: ['income_statement', 'balance_sheet', 'metrics'],
          description: 'Which tab: "income_statement" for P&L, "balance_sheet" for BS, "metrics" for KPIs'
        },
        metric: {
          type: 'string',
          description: 'Filter by metric name (e.g., "Gross Profit", "Revenue", "Headcount", "New Bookings")'
        },
        month: {
          type: 'string',
          description: 'Filter by month (e.g., "Jan", "Feb", "Mar")'
        },
        quarter: {
          type: 'string',
          description: 'Filter by quarter (e.g., "Q1", "Q2", "Q3", "Q4")'
        },
        year: {
          type: 'string',
          description: 'Filter by year (e.g., "2025", "2026")'
        },
        department: {
          type: 'string',
          description: 'Filter by department'
        },
        rollup: {
          type: 'string',
          description: 'Filter by FP&A rollup grouping'
        },
        account: {
          type: 'string',
          description: 'Filter by GL Account code'
        },
        vendor: {
          type: 'string',
          description: 'Filter by vendor name'
        },
        sheet_name: {
          type: 'string',
          description: 'Override: specific sheet tab name'
        }
      }
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
          description: 'Scenario name (e.g., "base", "upside", "downside")'
        },
        metric: {
          type: 'string',
          description: 'Specific metric or KPI to retrieve (e.g., "arr", "mrr", "burn_rate")'
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
    name: 'list_available_sheets',
    description: 'Lists all available Google Sheets and their tabs for budget and model data.',
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
