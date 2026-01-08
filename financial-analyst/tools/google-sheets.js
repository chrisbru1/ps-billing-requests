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

  async getBudgetData({ metric, period, department, sheet_name }) {
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
      const range = sheet_name ? `${sheet_name}!A:Z` : 'Budget Summary!A:Z';

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return {
          error: 'No data found in budget sheet',
          query: { metric, period, department, sheet_name }
        };
      }

      // Parse data - assume first row is headers
      const headers = rows[0].map(h => h?.toLowerCase().trim());
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] || null;
        });
        return obj;
      });

      // Filter by parameters
      const filtered = data.filter(row => {
        // Check metric match (flexible matching)
        const metricMatch = !metric || Object.entries(row).some(([key, value]) => {
          return (key.includes('metric') || key.includes('account') || key.includes('category') || key.includes('name')) &&
                 value?.toLowerCase().includes(metric.toLowerCase());
        });

        // Check period match
        const periodMatch = !period || Object.entries(row).some(([key, value]) => {
          return (key.includes('period') || key.includes('date') || key.includes('month') || key.includes('quarter') || key.includes('year')) &&
                 value?.toString().toLowerCase().includes(period.toLowerCase());
        });

        // Check department match
        const deptMatch = !department || Object.entries(row).some(([key, value]) => {
          return (key.includes('department') || key.includes('dept') || key.includes('cost center')) &&
                 value?.toLowerCase().includes(department.toLowerCase());
        });

        return metricMatch && periodMatch && deptMatch;
      });

      return {
        source: 'Google Sheets - Budget (Aleph FP&A sync)',
        sheet_id: sheetId,
        sheet_name: sheet_name || 'Budget Summary',
        query: { metric, period, department },
        results: filtered.slice(0, 100), // Limit to avoid token overload
        row_count: filtered.length,
        total_rows_in_sheet: data.length,
        headers: headers
      };

    } catch (error) {
      return {
        error: `Failed to fetch budget data: ${error.message}`,
        is_error: true,
        query: { metric, period, department, sheet_name }
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
