// Slack Block Kit Formatters for Financial Analyst Responses

/**
 * Format Claude's text response into Slack Block Kit format
 * @param {string} text - Claude's response text
 * @returns {object} - Slack message with text and blocks
 */
function formatResponse(text) {
  const blocks = [];

  // Split text into sections by double newlines
  const sections = text.split(/\n\n+/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Check if it's a markdown table
    if (isMarkdownTable(trimmed)) {
      blocks.push(formatTable(trimmed));
    }
    // Check if it's a header (starts with # or **)
    else if (trimmed.startsWith('#') || trimmed.match(/^\*\*[^*]+\*\*$/)) {
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: trimmed.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').substring(0, 150),
          emoji: true
        }
      });
    }
    // Regular section with mrkdwn
    else {
      // Slack has a 3000 char limit per section
      const truncated = trimmed.length > 2900 ? trimmed.substring(0, 2900) + '...' : trimmed;
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: truncated
        }
      });
    }
  }

  // Add divider before footer
  blocks.push({ type: 'divider' });

  // Add footer with timestamp
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `:chart_with_upwards_trend: Analysis generated at ${new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })}`
    }]
  });

  // Generate plain text fallback (for notifications)
  const plainText = text.length > 200 ? text.substring(0, 200) + '...' : text;

  return {
    text: plainText,
    blocks
  };
}

/**
 * Check if text is a markdown table
 * @param {string} text
 * @returns {boolean}
 */
function isMarkdownTable(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return false;

  // Check for table structure: | col | col | and separator line with ---
  const hasHeaderRow = lines[0].includes('|');
  const hasSeparator = lines.some(line => line.match(/^\|?[\s\-:|]+\|?$/));

  return hasHeaderRow && hasSeparator;
}

/**
 * Format markdown table for Slack (as code block since Slack doesn't support tables)
 * @param {string} tableText
 * @returns {object} - Slack block
 */
function formatTable(tableText) {
  // Clean up the table for better display
  const lines = tableText.split('\n');
  const cleanedLines = lines.map(line => {
    // Normalize spacing in table cells
    return line.replace(/\|\s+/g, '| ').replace(/\s+\|/g, ' |');
  });

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '```\n' + cleanedLines.join('\n') + '\n```'
    }
  };
}

/**
 * Format a financial comparison as Slack fields
 * @param {object} data - Object with metric: value pairs
 * @returns {object} - Slack section block with fields
 */
function formatFinancialFields(data) {
  const fields = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push({
      type: 'mrkdwn',
      text: `*${key}:*\n${formatCurrency(value)}`
    });

    // Slack limits to 10 fields per section
    if (fields.length >= 10) break;
  }

  return {
    type: 'section',
    fields
  };
}

/**
 * Format a number as currency
 * @param {number|string} value
 * @returns {string}
 */
function formatCurrency(value) {
  if (typeof value === 'string') {
    // Try to parse if it's a string number
    const parsed = parseFloat(value.replace(/[$,]/g, ''));
    if (isNaN(parsed)) return value;
    value = parsed;
  }

  if (typeof value !== 'number' || isNaN(value)) return String(value);

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1000000000) {
    return `${sign}$${(absValue / 1000000000).toFixed(1)}B`;
  }
  if (absValue >= 1000000) {
    return `${sign}$${(absValue / 1000000).toFixed(1)}M`;
  }
  if (absValue >= 1000) {
    return `${sign}$${(absValue / 1000).toFixed(0)}K`;
  }

  return `${sign}$${absValue.toFixed(2)}`;
}

/**
 * Format a variance value with color indication via emoji
 * @param {number} variance - Variance amount
 * @param {boolean} favorableIfPositive - Whether positive is good (true for revenue, false for expenses)
 * @returns {string}
 */
function formatVariance(variance, favorableIfPositive = true) {
  const formatted = formatCurrency(variance);
  const isFavorable = favorableIfPositive ? variance >= 0 : variance <= 0;

  if (variance === 0) {
    return `${formatted} :white_circle:`;
  }

  return isFavorable
    ? `${formatted} :large_green_circle:`
    : `${formatted} :red_circle:`;
}

/**
 * Create an error message block
 * @param {string} message - Error message
 * @returns {object} - Slack message with blocks
 */
function formatError(message) {
  return {
    text: 'Error analyzing your question',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:warning: *Unable to complete analysis*\n\n${message}`
        }
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: 'Please try rephrasing your question or contact the FP&A team for assistance.'
        }]
      }
    ]
  };
}

/**
 * Create a "thinking" indicator message
 * @returns {object} - Slack message
 */
function formatThinking() {
  return {
    text: 'Analyzing your question...',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':hourglass_flowing_sand: *Analyzing your question...*\n\nI\'m querying the financial data sources. This may take a moment.'
        }
      }
    ]
  };
}

module.exports = {
  formatResponse,
  formatFinancialFields,
  formatCurrency,
  formatVariance,
  formatError,
  formatThinking
};
