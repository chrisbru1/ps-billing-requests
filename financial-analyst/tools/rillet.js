// Rillet ERP Tool - Fetches actuals data from Rillet API

class RilletClient {
  constructor() {
    this.baseUrl = process.env.RILLET_API_BASE_URL || 'https://api.rillet.com/v1';
    this.apiKey = process.env.RILLET_API_KEY;
  }

  async request(endpoint, params = {}) {
    if (!this.apiKey) {
      throw new Error('Rillet API key not configured');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Rillet API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  // Parse period string into start/end dates
  parsePeriod(period) {
    const now = new Date();
    const currentYear = now.getFullYear();

    // Handle various period formats
    const periodLower = period.toLowerCase();

    // Full year: "FY2024", "2024"
    const yearMatch = periodLower.match(/(?:fy)?(\d{4})/);
    if (yearMatch && !periodLower.includes('q') && !periodLower.match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/)) {
      const year = parseInt(yearMatch[1]);
      return {
        start_date: `${year}-01-01`,
        end_date: `${year}-12-31`
      };
    }

    // Quarter: "Q4 2024", "Q1 2025"
    const quarterMatch = periodLower.match(/q([1-4])\s*(\d{4})?/);
    if (quarterMatch) {
      const quarter = parseInt(quarterMatch[1]);
      const year = quarterMatch[2] ? parseInt(quarterMatch[2]) : currentYear;
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = quarter * 3;
      return {
        start_date: `${year}-${String(startMonth).padStart(2, '0')}-01`,
        end_date: `${year}-${String(endMonth).padStart(2, '0')}-${endMonth === 2 ? '28' : (endMonth === 4 || endMonth === 6 || endMonth === 9 || endMonth === 11 ? '30' : '31')}`
      };
    }

    // Month: "January 2024", "Jan 2024", "2024-01"
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    for (let i = 0; i < months.length; i++) {
      if (periodLower.includes(months[i])) {
        const yearMatch = periodLower.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : currentYear;
        const month = i + 1;
        const lastDay = new Date(year, month, 0).getDate();
        return {
          start_date: `${year}-${String(month).padStart(2, '0')}-01`,
          end_date: `${year}-${String(month).padStart(2, '0')}-${lastDay}`
        };
      }
    }

    // ISO format: "2024-01"
    const isoMatch = period.match(/(\d{4})-(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1]);
      const month = parseInt(isoMatch[2]);
      const lastDay = new Date(year, month, 0).getDate();
      return {
        start_date: `${year}-${String(month).padStart(2, '0')}-01`,
        end_date: `${year}-${String(month).padStart(2, '0')}-${lastDay}`
      };
    }

    // Default to current year
    return {
      start_date: `${currentYear}-01-01`,
      end_date: `${currentYear}-12-31`
    };
  }

  async getActuals({ report_type, period, account_category, department }) {
    if (!this.apiKey) {
      return {
        error: 'Rillet API not configured. Please set RILLET_API_KEY environment variable.',
        is_error: true,
        hint: 'Contact your Rillet administrator to obtain API credentials.'
      };
    }

    try {
      const { start_date, end_date } = this.parsePeriod(period);

      // Map report types to Rillet API endpoints
      // Note: These endpoints are based on typical ERP API patterns.
      // Actual Rillet endpoints may differ - adjust based on their documentation.
      const endpointMap = {
        'income_statement': '/reports/income-statement',
        'balance_sheet': '/reports/balance-sheet',
        'cash_flow': '/reports/cash-flow',
        'gl_transactions': '/general-ledger/transactions',
        'ar_aging': '/reports/accounts-receivable-aging',
        'ap_aging': '/reports/accounts-payable-aging',
        'trial_balance': '/reports/trial-balance'
      };

      const endpoint = endpointMap[report_type];
      if (!endpoint) {
        return {
          error: `Unknown report type: ${report_type}`,
          is_error: true,
          available_report_types: Object.keys(endpointMap)
        };
      }

      const params = {
        start_date,
        end_date
      };

      if (account_category) {
        params.account_category = account_category;
      }

      if (department) {
        params.department = department;
        // Some APIs use cost_center instead
        params.cost_center = department;
      }

      const data = await this.request(endpoint, params);

      return {
        source: 'Rillet ERP',
        report_type,
        period: { start_date, end_date, original: period },
        filters: { account_category, department },
        results: data,
        fetched_at: new Date().toISOString()
      };

    } catch (error) {
      return {
        error: `Failed to fetch actuals from Rillet: ${error.message}`,
        is_error: true,
        report_type,
        period
      };
    }
  }
}

module.exports = new RilletClient();
