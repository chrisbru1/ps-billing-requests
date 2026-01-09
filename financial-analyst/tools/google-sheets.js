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

  async getBudgetData({ metric, month, quarter, year, department, sheet_name, account, vendor, rollup, statement_type }) {
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
      // First, get available tabs
      const tabsResponse = await this.sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields: 'sheets.properties.title'
      });
      const availableTabs = tabsResponse.data.sheets.map(s => s.properties.title);
      console.log(`[Sheets] Available tabs: ${availableTabs.join(', ')}`);

      // Smart tab selection based on what's being searched
      let targetSheet = sheet_name;

      // If statement_type is explicitly provided, use it
      if (!targetSheet && statement_type) {
        const stLower = statement_type.toLowerCase();
        targetSheet = availableTabs.find(tab => {
          const tabLower = tab.toLowerCase();
          if (stLower === 'income_statement' || stLower === 'income' || stLower === 'is' || stLower === 'pl' || stLower === 'pnl') {
            return tabLower.includes('income') || tabLower.includes('p&l') || tabLower.includes('pnl');
          }
          if (stLower === 'balance_sheet' || stLower === 'balance' || stLower === 'bs') {
            return tabLower.includes('balance');
          }
          if (stLower === 'metrics' || stLower === 'kpis' || stLower === 'operational') {
            return tabLower.includes('metric') || tabLower.includes('kpi');
          }
          return false;
        });
      }

      // Try to read the Context tab to get search term mappings
      let contextMappings = {};
      try {
        const contextResponse = await this.sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: "'Context for Claude'!A:C"
        });
        const contextRows = contextResponse.data.values || [];
        console.log(`[Sheets] Context tab has ${contextRows.length} rows`);
        if (contextRows.length > 0) {
          console.log(`[Sheets] Context headers: ${JSON.stringify(contextRows[0])}`);
        }
        if (contextRows.length > 1) {
          console.log(`[Sheets] Context first data row: ${JSON.stringify(contextRows[1])}`);
        }
        // Skip header row, build mapping: searchTerm -> { tab, column }
        for (let i = 1; i < contextRows.length; i++) {
          const [searchTerm, tab, column] = contextRows[i];
          if (searchTerm && tab) {
            contextMappings[searchTerm.toLowerCase()] = { tab, column };
          }
        }
        console.log(`[Sheets] Loaded ${Object.keys(contextMappings).length} context mappings`);
        console.log(`[Sheets] Sample mappings: ${JSON.stringify(Object.entries(contextMappings).slice(0, 3))}`);
      } catch (e) {
        console.log(`[Sheets] No Context tab or error reading it: ${e.message}`);
        console.log(`[Sheets] Context error stack: ${e.stack}`);
      }

      // Smart inference: use Context mappings first, then fall back to keywords
      if (!targetSheet && metric) {
        const metricLower = metric.toLowerCase();

        // Check exact match in context mappings
        if (contextMappings[metricLower]) {
          targetSheet = contextMappings[metricLower].tab;
          console.log(`[Sheets] Found exact match in Context: ${metric} -> ${targetSheet}`);
        } else {
          // Check partial matches in context mappings
          for (const [term, mapping] of Object.entries(contextMappings)) {
            if (metricLower.includes(term) || term.includes(metricLower)) {
              targetSheet = mapping.tab;
              console.log(`[Sheets] Found partial match in Context: ${metric} ~ ${term} -> ${targetSheet}`);
              break;
            }
          }
        }

        // Fall back to keyword-based inference
        if (!targetSheet) {
          const incomeKeywords = ['revenue', 'cogs', 'expense', 'cost', 'fee', 'labor', 'profit'];
          const balanceKeywords = ['asset', 'liability', 'equity', 'cash', 'receivable', 'payable'];
          const metricsKeywords = ['headcount', 'arr', 'bookings', 'sms', 'shops', 'volume'];

          if (incomeKeywords.some(k => metricLower.includes(k))) {
            targetSheet = availableTabs.find(t => t.toLowerCase().includes('income'));
          } else if (balanceKeywords.some(k => metricLower.includes(k))) {
            targetSheet = availableTabs.find(t => t.toLowerCase().includes('balance'));
          } else if (metricsKeywords.some(k => metricLower.includes(k))) {
            targetSheet = availableTabs.find(t => t.toLowerCase().includes('metric'));
          }
        }
      }

      // Default: use first tab that looks like income statement, or just the first tab
      if (!targetSheet) {
        targetSheet = availableTabs.find(t => t.toLowerCase().includes('income')) || availableTabs[0];
      }

      console.log(`[Sheets] Using tab: ${targetSheet} (inferred from query)`);
      const range = `'${targetSheet}'!A:Z`;

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return {
          error: `No data found in budget sheet tab: ${targetSheet}`,
          query: { metric, month, quarter, year, department, sheet_name, statement_type }
        };
      }

      // Aleph format: headers are always in row 14 (index 13), skip first 13 metadata rows
      const headerRowIndex = 13;
      console.log(`[Sheets] Using Aleph format - header row at index ${headerRowIndex}`);

      // Parse data - header row found dynamically
      const headers = rows[headerRowIndex].map(h => h?.toString().trim());
      const headersLower = headers.map(h => h?.toLowerCase());
      const data = rows.slice(headerRowIndex + 1).map(row => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] || null;
        });
        return obj;
      });

      // Find column indices - support both normalized format and Aleph export format
      let metricCol = headersLower.findIndex(h => h === 'metric');
      const monthCol = headersLower.findIndex(h => h === 'month');
      const quarterCol = headersLower.findIndex(h => h === 'quarter');
      const yearCol = headersLower.findIndex(h => h === 'year');
      let amountCol = headersLower.findIndex(h => h === 'amount');
      const deptCol = headersLower.findIndex(h => h?.includes('department'));
      const accountCol = headersLower.findIndex(h => h === 'account');
      const vendorCol = headersLower.findIndex(h => h === 'vendor');
      const rollupCol = headersLower.findIndex(h => h?.includes('rollup'));

      // Aleph format: "Consolidated Rollup Aleph" is the metric, "value" is the amount
      if (metricCol < 0 && rollupCol >= 0) {
        metricCol = rollupCol; // Use rollup as the metric column
        console.log(`[Sheets] Using rollup column as metric (Aleph format)`);
      }
      if (amountCol < 0) {
        amountCol = headersLower.findIndex(h => h === 'value');
        if (amountCol >= 0) {
          console.log(`[Sheets] Using 'value' column as amount (Aleph format)`);
        }
      }

      console.log(`[Sheets] Tab: ${targetSheet}, Columns: metric=${metricCol}, month=${monthCol}, quarter=${quarterCol}, year=${yearCol}, amount=${amountCol}, rollup=${rollupCol}`);
      console.log(`[Sheets] Total rows: ${data.length}`);
      console.log(`[Sheets] Headers (first 10): ${headers.slice(0, 10).join(' | ')}`);
      console.log(`[Sheets] Headers (raw): ${JSON.stringify(headers.slice(0, 10))}`);
      if (data.length > 0) {
        console.log(`[Sheets] First row sample: ${JSON.stringify(data[0])}`);
      }

      // Helper to extract year from date string like "2025-04-01" or date object
      const extractYear = (dateVal) => {
        if (!dateVal) return null;
        const str = dateVal.toString();
        // Try to find a 4-digit year
        const match = str.match(/20\d{2}/);
        return match ? match[0] : null;
      };

      // Helper to extract quarter from date
      const extractQuarter = (dateVal) => {
        if (!dateVal) return null;
        const str = dateVal.toString();
        // Parse month from date like "2025-04-01"
        const match = str.match(/\d{4}-(\d{2})/);
        if (match) {
          const monthNum = parseInt(match[1]);
          if (monthNum <= 3) return 'Q1';
          if (monthNum <= 6) return 'Q2';
          if (monthNum <= 9) return 'Q3';
          return 'Q4';
        }
        return null;
      };

      // Filter by parameters
      const filtered = data.filter(row => {
        // Filter by metric/rollup - prefer exact matching for rollup column
        if (metric) {
          const metricLower = metric.toLowerCase().trim();
          const rowRollup = rollupCol >= 0 ? (row[headers[rollupCol]]?.toString().toLowerCase().trim() || '') : '';

          // EXACT match only - the rollup value must exactly match the search term
          // This prevents "Indirect Labor" from matching "Labor" or "Direct Labor"
          if (rowRollup !== metricLower) return false;
        }

        // Get date value for month/quarter/year filtering
        const dateVal = monthCol >= 0 ? row[headers[monthCol]] : null;

        // Filter by month (e.g., "Jan", "Feb", "Jan-26", or "2025-04")
        if (month && monthCol >= 0) {
          const rowMonth = row[headers[monthCol]]?.toString().toLowerCase() || '';
          if (!rowMonth.includes(month.toLowerCase())) return false;
        }

        // Filter by quarter (e.g., "Q1", "Q2") - extract from date if no quarter column
        if (quarter) {
          if (quarterCol >= 0) {
            const rowQuarter = row[headers[quarterCol]]?.toString().toLowerCase() || '';
            if (!rowQuarter.includes(quarter.toLowerCase())) return false;
          } else {
            // Extract quarter from Month date column
            const rowQuarter = extractQuarter(dateVal);
            if (!rowQuarter || !rowQuarter.toLowerCase().includes(quarter.toLowerCase())) return false;
          }
        }

        // Filter by year (e.g., "2025", "2026") - extract from date if no year column
        if (year) {
          if (yearCol >= 0) {
            const rowYear = row[headers[yearCol]]?.toString() || '';
            if (!rowYear.includes(year.toString())) return false;
          } else {
            // Extract year from Month date column
            const rowYear = extractYear(dateVal);
            if (!rowYear || !rowYear.includes(year.toString())) return false;
          }
        }

        // Filter by department
        if (department && deptCol >= 0) {
          const rowDept = row[headers[deptCol]]?.toString().toLowerCase() || '';
          if (!rowDept.includes(department.toLowerCase())) return false;
        }

        // Filter by account
        if (account && accountCol >= 0) {
          const rowAccount = row[headers[accountCol]]?.toString().toLowerCase() || '';
          if (!rowAccount.includes(account.toLowerCase())) return false;
        }

        // Filter by vendor
        if (vendor && vendorCol >= 0) {
          const rowVendor = row[headers[vendorCol]]?.toString().toLowerCase() || '';
          if (!rowVendor.includes(vendor.toLowerCase())) return false;
        }

        // Filter by rollup
        if (rollup && rollupCol >= 0) {
          const rowRollup = row[headers[rollupCol]]?.toString().toLowerCase() || '';
          if (!rowRollup.includes(rollup.toLowerCase())) return false;
        }

        return true;
      });

      console.log(`[Sheets] Filtered to ${filtered.length} rows`);

      // Debug: show unique rollup values matched
      if (rollupCol >= 0 && filtered.length > 0) {
        const uniqueRollups = [...new Set(filtered.map(r => r[headers[rollupCol]]).filter(Boolean))];
        console.log(`[Sheets] Unique rollup values in results: ${uniqueRollups.join(', ')}`);
      }

      // Debug: check for potential duplicates (same dept + month)
      if (filtered.length > 0 && deptCol >= 0 && monthCol >= 0) {
        const seen = new Set();
        let dupeCount = 0;
        for (const row of filtered) {
          const key = `${row[headers[deptCol]]}_${row[headers[monthCol]]}`;
          if (seen.has(key)) {
            dupeCount++;
          }
          seen.add(key);
        }
        if (dupeCount > 0) {
          console.log(`[Sheets] WARNING: ${dupeCount} potential duplicate rows (same dept+month)`);
        }
      }

      // If no results found, return helpful debug info
      if (filtered.length === 0) {
        const sampleMetrics = [...new Set(data.slice(0, 100).map(row =>
          metricCol >= 0 ? row[headers[metricCol]] : row[headers[0]]
        ).filter(Boolean))];

        return {
          source: 'Google Sheets - Budget',
          sheet_name: targetSheet,
          available_tabs: availableTabs,
          error: 'No matching rows found',
          query: { metric, month, quarter, year, department, account, vendor, rollup, statement_type },
          total_rows_in_sheet: data.length,
          headers: headers,
          available_metrics: sampleMetrics.slice(0, 30),
          hint: 'Try a different metric name from the available_metrics list, or check a different tab'
        };
      }

      // Helper to parse formatted numbers from spreadsheet (handles commas, currency, dashes, parentheses)
      const parseNumber = (val) => {
        if (val === null || val === undefined) return 0;
        const str = val.toString().trim();
        // Check for dash/empty representing zero
        if (str === '' || str === '-' || /^\s*-\s*$/.test(str)) return 0;
        // Check for parentheses (negative number)
        const isNegative = str.startsWith('(') && str.endsWith(')');
        // Remove currency symbols, commas, parentheses, spaces
        const cleaned = str.replace(/[$,()%\s]/g, '');
        const num = parseFloat(cleaned);
        if (isNaN(num)) return 0;
        return isNegative ? -num : num;
      };

      // Calculate totals if Amount column exists
      let total = null;
      if (amountCol >= 0) {
        total = filtered.reduce((sum, row) => {
          const val = parseNumber(row[headers[amountCol]]);
          return sum + val;
        }, 0);
      }

      // Group by metric and sum amounts for easier analysis
      const metricSummary = {};
      if (metricCol >= 0 && amountCol >= 0) {
        for (const row of filtered) {
          const metricName = row[headers[metricCol]];
          const amount = parseNumber(row[headers[amountCol]]);
          if (metricName) {
            metricSummary[metricName] = (metricSummary[metricName] || 0) + amount;
          }
        }
      }

      // Log a sample of parsed values for debugging
      if (filtered.length > 0 && amountCol >= 0) {
        const sampleValues = filtered.slice(0, 5).map(r => ({
          raw: r[headers[amountCol]],
          parsed: parseNumber(r[headers[amountCol]])
        }));
        console.log(`[Sheets] Sample parsed values: ${JSON.stringify(sampleValues)}`);
      }

      return {
        source: 'Google Sheets - Budget',
        sheet_name: targetSheet,
        available_tabs: availableTabs,
        query: { metric, month, quarter, year, department, account, vendor, rollup, statement_type },
        results: filtered.slice(0, 100), // Reduce to avoid token overload
        row_count: filtered.length,
        total_rows_in_sheet: data.length,
        total_amount: total,
        metric_totals: metricSummary, // Summary by metric name
        headers: headers,
        hint: 'metric_totals shows sum by metric. total_amount is grand total. Use these numbers directly!'
      };

    } catch (error) {
      console.error(`[Sheets] Error: ${error.message}`);
      console.error(`[Sheets] Stack: ${error.stack}`);

      return {
        error: `Failed to fetch budget data: ${error.message}`,
        is_error: true,
        query: { metric, month, quarter, year, department, sheet_name, statement_type },
        hint: 'Check Heroku logs for details. The Google Sheets API may have returned an error.'
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
