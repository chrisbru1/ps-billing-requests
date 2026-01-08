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

  /**
   * Calculate account balance from journal entries
   * @param {object} params
   * @param {string} params.account_code - Account code (e.g., "24000")
   * @param {string} params.account_name - Account name to search for (e.g., "SLW")
   * @param {string} params.as_of_date - Calculate balance as of this date (ISO format)
   * @returns {Promise<object>} - Account balance information
   */
  async calculateAccountBalance({ account_code, account_name, as_of_date }) {
    if (!this.apiKey) {
      return {
        error: 'Rillet API not configured.',
        is_error: true
      };
    }

    try {
      // First, get the chart of accounts to find matching accounts and their types
      const accountsData = await this.request('/accounts');
      const accounts = accountsData.data || accountsData;

      // Find matching accounts
      let matchingAccounts = [];
      if (account_code) {
        matchingAccounts = accounts.filter(a =>
          a.code === account_code ||
          a.accountCode === account_code ||
          String(a.code) === String(account_code)
        );
      }
      if (account_name && matchingAccounts.length === 0) {
        const searchTerm = account_name.toLowerCase();
        matchingAccounts = accounts.filter(a =>
          (a.name && a.name.toLowerCase().includes(searchTerm)) ||
          (a.accountName && a.accountName.toLowerCase().includes(searchTerm))
        );
      }

      if (matchingAccounts.length === 0) {
        return {
          error: `No accounts found matching code "${account_code}" or name "${account_name}"`,
          is_error: true,
          hint: 'Use get_chart_of_accounts to see available accounts'
        };
      }

      // Get all journal entries (with pagination if needed)
      let allEntries = [];
      let cursor = null;
      let pageCount = 0;
      const maxPages = 20; // Safety limit

      do {
        const params = { limit: 100 };
        if (cursor) params.cursor = cursor;
        if (as_of_date) params.created_at_max = as_of_date;

        const response = await this.request('/journal-entries', params);
        const entries = response.data || response;

        if (Array.isArray(entries)) {
          allEntries = allEntries.concat(entries);
        }

        // Check for pagination cursor
        cursor = response.meta?.cursor || response.nextCursor || null;
        pageCount++;
      } while (cursor && pageCount < maxPages);

      // Calculate balances for each matching account
      const results = [];

      for (const account of matchingAccounts) {
        const accountCode = account.code || account.accountCode;
        const accountName = account.name || account.accountName;
        const accountType = (account.type || account.accountType || '').toUpperCase();
        const accountSubtype = account.subtype || account.accountSubtype || '';

        let totalDebits = 0;
        let totalCredits = 0;
        let transactionCount = 0;

        // Search through all journal entries for this account
        for (const entry of allEntries) {
          const lines = entry.lines || entry.lineItems || [];

          for (const line of lines) {
            const lineAccountCode = line.accountCode || line.account?.code || line.accountId;

            // Match by account code
            if (String(lineAccountCode) === String(accountCode)) {
              const debit = parseFloat(line.debit || line.debitAmount || 0);
              const credit = parseFloat(line.credit || line.creditAmount || 0);

              totalDebits += debit;
              totalCredits += credit;
              transactionCount++;
            }
          }
        }

        // Calculate balance based on account type
        // Liabilities, Equity, Revenue: Credit balance (Credits - Debits)
        // Assets, Expenses: Debit balance (Debits - Credits)
        let balance;
        let balanceType;

        if (['LIABILITY', 'LIABILITIES', 'EQUITY', 'REVENUE', 'INCOME'].includes(accountType)) {
          balance = totalCredits - totalDebits;
          balanceType = 'credit';
        } else {
          balance = totalDebits - totalCredits;
          balanceType = 'debit';
        }

        results.push({
          account_code: accountCode,
          account_name: accountName,
          account_type: accountType,
          account_subtype: accountSubtype,
          total_debits: totalDebits,
          total_credits: totalCredits,
          balance: balance,
          balance_type: balanceType,
          transaction_count: transactionCount,
          formatted_balance: this.formatCurrency(balance)
        });
      }

      return {
        source: 'Rillet ERP (calculated from journal entries)',
        as_of_date: as_of_date || 'all time',
        journal_entries_scanned: allEntries.length,
        accounts: results,
        total_balance: results.reduce((sum, r) => sum + r.balance, 0),
        formatted_total: this.formatCurrency(results.reduce((sum, r) => sum + r.balance, 0)),
        fetched_at: new Date().toISOString()
      };

    } catch (error) {
      return {
        error: `Failed to calculate account balance: ${error.message}`,
        is_error: true
      };
    }
  }

  /**
   * Generate a trial balance from journal entries
   * @param {object} params
   * @param {string} params.as_of_date - Calculate as of this date
   * @param {string} params.account_type - Filter by account type (e.g., "LIABILITY", "ASSET")
   * @returns {Promise<object>} - Trial balance
   */
  async calculateTrialBalance({ as_of_date, account_type }) {
    if (!this.apiKey) {
      return {
        error: 'Rillet API not configured.',
        is_error: true
      };
    }

    try {
      // Get chart of accounts
      const accountsData = await this.request('/accounts');
      let accounts = accountsData.data || accountsData;

      // Filter by type if specified
      if (account_type) {
        const typeUpper = account_type.toUpperCase();
        accounts = accounts.filter(a =>
          (a.type || a.accountType || '').toUpperCase().includes(typeUpper)
        );
      }

      // Get all journal entries
      let allEntries = [];
      let cursor = null;
      let pageCount = 0;

      do {
        const params = { limit: 100 };
        if (cursor) params.cursor = cursor;
        if (as_of_date) params.created_at_max = as_of_date;

        const response = await this.request('/journal-entries', params);
        const entries = response.data || response;

        if (Array.isArray(entries)) {
          allEntries = allEntries.concat(entries);
        }

        cursor = response.meta?.cursor || response.nextCursor || null;
        pageCount++;
      } while (cursor && pageCount < 20);

      // Build a map of account codes to their info
      const accountMap = {};
      for (const account of accounts) {
        const code = account.code || account.accountCode;
        accountMap[code] = {
          code,
          name: account.name || account.accountName,
          type: (account.type || account.accountType || '').toUpperCase(),
          subtype: account.subtype || account.accountSubtype || '',
          debits: 0,
          credits: 0
        };
      }

      // Sum up all journal entry lines
      for (const entry of allEntries) {
        const lines = entry.lines || entry.lineItems || [];

        for (const line of lines) {
          const lineAccountCode = String(line.accountCode || line.account?.code || line.accountId);

          if (accountMap[lineAccountCode]) {
            accountMap[lineAccountCode].debits += parseFloat(line.debit || line.debitAmount || 0);
            accountMap[lineAccountCode].credits += parseFloat(line.credit || line.creditAmount || 0);
          }
        }
      }

      // Calculate balances and build trial balance
      const trialBalance = [];
      let totalDebits = 0;
      let totalCredits = 0;

      for (const [code, account] of Object.entries(accountMap)) {
        if (account.debits === 0 && account.credits === 0) continue; // Skip zero-activity accounts

        let balance;
        if (['LIABILITY', 'LIABILITIES', 'EQUITY', 'REVENUE', 'INCOME'].includes(account.type)) {
          balance = account.credits - account.debits;
        } else {
          balance = account.debits - account.credits;
        }

        totalDebits += account.debits;
        totalCredits += account.credits;

        trialBalance.push({
          account_code: code,
          account_name: account.name,
          account_type: account.type,
          debits: account.debits,
          credits: account.credits,
          balance: balance,
          formatted_balance: this.formatCurrency(balance)
        });
      }

      // Sort by account code
      trialBalance.sort((a, b) => String(a.account_code).localeCompare(String(b.account_code)));

      return {
        source: 'Rillet ERP (calculated from journal entries)',
        as_of_date: as_of_date || 'all time',
        account_type_filter: account_type || 'all',
        journal_entries_scanned: allEntries.length,
        accounts_with_activity: trialBalance.length,
        trial_balance: trialBalance,
        totals: {
          total_debits: totalDebits,
          total_credits: totalCredits,
          difference: totalDebits - totalCredits,
          is_balanced: Math.abs(totalDebits - totalCredits) < 0.01
        },
        fetched_at: new Date().toISOString()
      };

    } catch (error) {
      return {
        error: `Failed to calculate trial balance: ${error.message}`,
        is_error: true
      };
    }
  }

  formatCurrency(amount) {
    const absAmount = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';

    if (absAmount >= 1000000) {
      return `${sign}$${(absAmount / 1000000).toFixed(2)}M`;
    } else if (absAmount >= 1000) {
      return `${sign}$${(absAmount / 1000).toFixed(1)}K`;
    } else {
      return `${sign}$${absAmount.toFixed(2)}`;
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
