// Google Sheets Tool - Accesses budget (from Aleph) and financial model data

const { google } = require('googleapis');

class GoogleSheetsClient {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Check for required environment variables
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.warn('Google Sheets credentials not configured. Sheets tools will return mock data.');
      this.initialized = true;
      return;
    }

    try {
      this.auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/spreadsheets.readonly']
      );

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Google Sheets client:', error.message);
      this.initialized = true; // Mark as initialized to avoid retrying
    }
  }

  /**
   * Get the context/instructions tab that explains the budget data structure
   */
  async getBudgetContext() {
    await this.initialize();

    const sheetId = process.env.GOOGLE_BUDGET_SHEET_ID;
    if (!this.sheets || !sheetId) {
      return null;
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'Context for Claude!A:Z'
      });

      return response.data.values;
    } catch (error) {
      console.log('[Sheets] No Context for Claude tab found:', error.message);
      return null;
    }
  }

  async getBudgetData({ metric, period, department, sheet_name, account, vendor, rollup, statement_type }) {
    await this.initialize();

    const sheetId = process.env.GOOGLE_BUDGET_SHEET_ID;

    if (!this.sheets || !sheetId) {
      return {
        error: 'Google Sheets not configured. Please set GOOGLE_BUDGET_SHEET_ID and service account credentials.',
        is_error: true,
        hint: 'Configure environment variables: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_BUDGET_SHEET_ID'
      };
    }

    try {
      // Map statement_type to actual tab names in the budget sheet
      let targetSheet = sheet_name;
      if (!targetSheet && statement_type) {
        const sheetMap = {
          'income_statement': 'Income Statement | Budget | Aleph',
          'income': 'Income Statement | Budget | Aleph',
          'is': 'Income Statement | Budget | Aleph',
          'pl': 'Income Statement | Budget | Aleph',
          'pnl': 'Income Statement | Budget | Aleph',
          'balance_sheet': 'Balance Sheet | Budget | Aleph',
          'balance': 'Balance Sheet | Budget | Aleph',
          'bs': 'Balance Sheet | Budget | Aleph',
          'metrics': 'Metrics',
          'kpis': 'Metrics',
          'operational': 'Metrics'
        };
        targetSheet = sheetMap[statement_type.toLowerCase()];
      }

      // Default to Income Statement if no sheet specified
      if (!targetSheet) {
        targetSheet = 'Income Statement | Budget | Aleph';
      }

      const range = `'${targetSheet}'!A:ZZ`;

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return {
          error: `No data found in budget sheet tab: ${targetSheet}`,
          query: { metric, period, department, sheet_name, statement_type }
        };
      }

      // Parse data - first row is headers
      const headers = rows[0].map(h => h?.toString().trim());
      const headersLower = headers.map(h => h?.toLowerCase());
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] || null;
        });
        return obj;
      });

      // Find column indices for filtering
      const accountCol = headersLower.findIndex(h => h === 'account');
      const vendorCol = headersLower.findIndex(h => h === 'vendor');
      const deptCol = headersLower.findIndex(h => h?.includes('department'));
      const rollupCol = headersLower.findIndex(h => h?.includes('consolidated rollup'));

      // Filter by parameters
      const filtered = data.filter(row => {
        // Filter by account (GL Account from Rillet)
        if (account) {
          const rowAccount = row[headers[accountCol]]?.toString().toLowerCase() || '';
          if (!rowAccount.includes(account.toLowerCase())) return false;
        }

        // Filter by vendor
        if (vendor && vendorCol >= 0) {
          const rowVendor = row[headers[vendorCol]]?.toString().toLowerCase() || '';
          if (!rowVendor.includes(vendor.toLowerCase())) return false;
        }

        // Filter by department
        if (department && deptCol >= 0) {
          const rowDept = row[headers[deptCol]]?.toString().toLowerCase() || '';
          if (!rowDept.includes(department.toLowerCase())) return false;
        }

        // Filter by rollup (FP&A grouping)
        if (rollup && rollupCol >= 0) {
          const rowRollup = row[headers[rollupCol]]?.toString().toLowerCase() || '';
          if (!rowRollup.includes(rollup.toLowerCase())) return false;
        }

        // Filter by metric (search across account and rollup)
        if (metric) {
          const metricLower = metric.toLowerCase();
          const accountMatch = row[headers[accountCol]]?.toString().toLowerCase().includes(metricLower);
          const rollupMatch = rollupCol >= 0 && row[headers[rollupCol]]?.toString().toLowerCase().includes(metricLower);
          if (!accountMatch && !rollupMatch) return false;
        }

        // Filter by period (search in headers that look like dates/months)
        if (period) {
          // Period filtering is complex - usually columns are months
          // For now, include all rows and let Claude interpret the period columns
        }

        return true;
      });

      return {
        source: 'Google Sheets - Budget (Aleph FP&A sync)',
        sheet_id: sheetId,
        sheet_name: targetSheet,
        query: { metric, period, department, account, vendor, rollup, statement_type },
        results: filtered.slice(0, 200), // Limit to avoid token overload
        row_count: filtered.length,
        total_rows_in_sheet: data.length,
        headers: headers,
        hint: 'Month columns contain budget amounts. Use "Consolidated Rollup Aleph" for FP&A groupings.'
      };

    } catch (error) {
      return {
        error: `Failed to fetch budget data: ${error.message}`,
        is_error: true,
        query: { metric, period, department, sheet_name, statement_type }
      };
    }
  }

  async getFinancialModel({ data_type, scenario, metric, period }) {
    await this.initialize();

    const sheetId = process.env.GOOGLE_FINANCIAL_MODEL_SHEET_ID;

    if (!this.sheets || !sheetId) {
      return {
        error: 'Financial model sheet not configured. Please set GOOGLE_FINANCIAL_MODEL_SHEET_ID.',
        is_error: true
      };
    }

    try {
      // Map data_type to likely sheet names
      const sheetNameMap = {
        'projection': 'Projections',
        'scenario': 'Scenarios',
        'assumptions': 'Assumptions',
        'summary': 'Summary',
        'kpis': 'KPIs'
      };

      const range = `${sheetNameMap[data_type] || 'Summary'}!A:Z`;

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return {
          error: `No data found in ${data_type} sheet`,
          query: { data_type, scenario, metric, period }
        };
      }

      // Parse data
      const headers = rows[0].map(h => h?.toLowerCase().trim());
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] || null;
        });
        return obj;
      });

      // Filter by parameters if provided
      let filtered = data;

      if (scenario) {
        filtered = filtered.filter(row =>
          Object.values(row).some(v => v?.toString().toLowerCase().includes(scenario.toLowerCase()))
        );
      }

      if (metric) {
        filtered = filtered.filter(row =>
          Object.values(row).some(v => v?.toString().toLowerCase().includes(metric.toLowerCase()))
        );
      }

      if (period) {
        filtered = filtered.filter(row =>
          Object.values(row).some(v => v?.toString().toLowerCase().includes(period.toLowerCase()))
        );
      }

      return {
        source: 'Google Sheets - Financial Model',
        sheet_id: sheetId,
        data_type,
        scenario: scenario || 'all',
        query: { data_type, scenario, metric, period },
        results: filtered.slice(0, 100),
        row_count: filtered.length,
        headers: headers
      };

    } catch (error) {
      return {
        error: `Failed to fetch financial model data: ${error.message}`,
        is_error: true,
        query: { data_type, scenario, metric, period }
      };
    }
  }

  async listAvailableSheets({ sheet_type }) {
    await this.initialize();

    if (!this.sheets) {
      return {
        error: 'Google Sheets not configured',
        is_error: true
      };
    }

    const results = {};

    try {
      if (sheet_type === 'budget' || sheet_type === 'all') {
        const budgetSheetId = process.env.GOOGLE_BUDGET_SHEET_ID;
        if (budgetSheetId) {
          const response = await this.sheets.spreadsheets.get({
            spreadsheetId: budgetSheetId,
            fields: 'sheets.properties.title'
          });
          results.budget = {
            sheet_id: budgetSheetId,
            tabs: response.data.sheets.map(s => s.properties.title)
          };
        }
      }

      if (sheet_type === 'model' || sheet_type === 'all') {
        const modelSheetId = process.env.GOOGLE_FINANCIAL_MODEL_SHEET_ID;
        if (modelSheetId) {
          const response = await this.sheets.spreadsheets.get({
            spreadsheetId: modelSheetId,
            fields: 'sheets.properties.title'
          });
          results.model = {
            sheet_id: modelSheetId,
            tabs: response.data.sheets.map(s => s.properties.title)
          };
        }
      }

      return {
        source: 'Google Sheets',
        available_sheets: results
      };

    } catch (error) {
      return {
        error: `Failed to list sheets: ${error.message}`,
        is_error: true
      };
    }
  }
}

module.exports = new GoogleSheetsClient();
