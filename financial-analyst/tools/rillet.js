// Rillet ERP Tool - Fetches actuals data from Rillet API

class RilletClient {
  constructor() {
    this.baseUrl = process.env.RILLET_API_BASE_URL || 'https://api.rillet.com';
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

    console.log(`[Rillet] Fetching: ${url.toString()}`);

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

  // Parse month string to YYYY-MM format for ARR waterfall
  parseMonth(period) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const periodLower = period.toLowerCase();

    // Month names
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    for (let i = 0; i < months.length; i++) {
      if (periodLower.includes(months[i])) {
        const yearMatch = periodLower.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : currentYear;
        return `${year}-${String(i + 1).padStart(2, '0')}`;
      }
    }

    // ISO format: "2024-01"
    const isoMatch = period.match(/(\d{4})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}`;
    }

    // Quarter - return last month of quarter
    const quarterMatch = periodLower.match(/q([1-4])\s*(\d{4})?/);
    if (quarterMatch) {
      const quarter = parseInt(quarterMatch[1]);
      const year = quarterMatch[2] ? parseInt(quarterMatch[2]) : currentYear;
      const endMonth = quarter * 3;
      return `${year}-${String(endMonth).padStart(2, '0')}`;
    }

    // Default to current month
    return `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async getAccounts() {
    if (!this.apiKey) {
      return {
        error: 'Rillet API not configured. Please set RILLET_API_KEY environment variable.',
        is_error: true
      };
    }

    try {
      const data = await this.request('/accounts');
      return {
        source: 'Rillet ERP',
        data_type: 'chart_of_accounts',
        results: data,
        fetched_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: `Failed to fetch accounts from Rillet: ${error.message}`,
        is_error: true
      };
    }
  }

  async getJournalEntries({ start_date, end_date, subsidiary }) {
    if (!this.apiKey) {
      return {
        error: 'Rillet API not configured. Please set RILLET_API_KEY environment variable.',
        is_error: true
      };
    }

    try {
      const params = {};
      if (start_date) params.created_at_min = start_date;
      if (end_date) params.created_at_max = end_date;
      if (subsidiary) params.subsidiary = subsidiary;

      const data = await this.request('/journal-entries', params);
      return {
        source: 'Rillet ERP',
        data_type: 'journal_entries',
        filters: { start_date, end_date, subsidiary },
        results: data,
        fetched_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: `Failed to fetch journal entries from Rillet: ${error.message}`,
        is_error: true
      };
    }
  }

  async getARRWaterfall({ month, status, breakdown, subsidiary }) {
    if (!this.apiKey) {
      return {
        error: 'Rillet API not configured. Please set RILLET_API_KEY environment variable.',
        is_error: true
      };
    }

    try {
      const params = {};
      if (month) params.month = this.parseMonth(month);
      if (status) params.status = status;
      if (breakdown) params.breakdown = breakdown;
      if (subsidiary) params.subsidiary = subsidiary;

      const data = await this.request('/reports/arr-waterfall', params);
      return {
        source: 'Rillet ERP',
        data_type: 'arr_waterfall',
        month: params.month,
        filters: { status, breakdown, subsidiary },
        results: data,
        fetched_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: `Failed to fetch ARR waterfall from Rillet: ${error.message}`,
        is_error: true
      };
    }
  }

  async getBankAccounts({ subsidiary }) {
    if (!this.apiKey) {
      return {
        error: 'Rillet API not configured. Please set RILLET_API_KEY environment variable.',
        is_error: true
      };
    }

    try {
      const params = {};
      if (subsidiary) params.subsidiary = subsidiary;

      const data = await this.request('/bank-accounts', params);
      return {
        source: 'Rillet ERP',
        data_type: 'bank_accounts',
        results: data,
        fetched_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: `Failed to fetch bank accounts from Rillet: ${error.message}`,
        is_error: true
      };
    }
  }

  async getLastClosedPeriod() {
    if (!this.apiKey) {
      return {
        error: 'Rillet API not configured. Please set RILLET_API_KEY environment variable.',
        is_error: true
      };
    }

    try {
      const data = await this.request('/books/periods/last-closed');
      return {
        source: 'Rillet ERP',
        data_type: 'last_closed_period',
        results: data,
        fetched_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: `Failed to fetch last closed period from Rillet: ${error.message}`,
        is_error: true
      };
    }
  }

  // Legacy method for backward compatibility - routes to appropriate new method
  async getActuals({ report_type, period, account_category, department }) {
    // Map old report types to new methods
    switch (report_type) {
      case 'arr_waterfall':
        return this.getARRWaterfall({ month: period });
      case 'journal_entries':
      case 'gl_transactions':
        return this.getJournalEntries({});
      case 'accounts':
      case 'chart_of_accounts':
        return this.getAccounts();
      case 'bank_accounts':
        return this.getBankAccounts({});
      default:
        return {
          error: `Report type '${report_type}' is not directly available in Rillet API.`,
          is_error: true,
          hint: 'Available Rillet data: arr_waterfall, journal_entries, accounts, bank_accounts. For income statement/balance sheet, data would need to be derived from journal entries.',
          available_types: ['arr_waterfall', 'journal_entries', 'accounts', 'bank_accounts']
        };
    }
  }
}

module.exports = new RilletClient();
