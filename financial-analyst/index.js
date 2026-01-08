// Financial Analyst Orchestrator - Manages Claude tool use loop

const ClaudeClient = require('./claude-client');
const tools = require('./tools');
const { formatResponse, formatError } = require('./formatters/slack-blocks');
const { SYSTEM_PROMPT, TOOL_DEFINITIONS } = require('./config');

// Maximum iterations to prevent infinite tool loops
const MAX_TOOL_ITERATIONS = 10;

/**
 * Analyze a financial question using Claude with tool use
 * @param {string} question - User's question
 * @param {object} context - Additional context (userId, threadTs)
 * @returns {Promise<object>} - Formatted Slack message response
 */
async function analyze(question, context = {}) {
  const claude = new ClaudeClient();

  // Build initial messages
  const messages = [
    {
      role: 'user',
      content: question
    }
  ];

  let iteration = 0;

  try {
    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      console.log(`[FPA Bot] Iteration ${iteration}: Calling Claude...`);

      // Call Claude with tools
      const response = await claude.createMessageWithRetry({
        system: SYSTEM_PROMPT,
        messages,
        tools: TOOL_DEFINITIONS,
        max_tokens: 4096
      });

      console.log(`[FPA Bot] Claude response - stop_reason: ${response.stop_reason}`);

      // Check if Claude wants to use tools
      if (response.stop_reason === 'tool_use') {
        const toolResults = [];

        // Process all tool use blocks
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            console.log(`[FPA Bot] Executing tool: ${block.name}`);

            // Execute the tool
            const result = await tools.execute(block.name, block.input);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            });
          }
        }

        // Add assistant's response and tool results to conversation
        messages.push({
          role: 'assistant',
          content: response.content
        });

        messages.push({
          role: 'user',
          content: toolResults
        });

      } else {
        // Final response - extract text content
        const textContent = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');

        if (!textContent) {
          console.warn('[FPA Bot] Claude returned no text content');
          return formatError('I was unable to generate a response. Please try rephrasing your question.');
        }

        console.log(`[FPA Bot] Analysis complete after ${iteration} iteration(s)`);

        // Format for Slack
        return formatResponse(textContent);
      }
    }

    // If we hit max iterations, return what we have
    console.error(`[FPA Bot] Max iterations (${MAX_TOOL_ITERATIONS}) reached`);
    return formatError('The analysis took too long. Please try a simpler question or break it into parts.');

  } catch (error) {
    console.error('[FPA Bot] Analysis error:', error);

    // Handle specific error types
    if (error.status === 401) {
      return formatError('Authentication error with AI service. Please contact the administrator.');
    }

    if (error.status === 429) {
      return formatError('The AI service is currently busy. Please try again in a few moments.');
    }

    if (error.status === 529) {
      return formatError('The AI service is temporarily overloaded. Please try again in a few minutes.');
    }

    // Generic error
    return formatError(
      'I encountered an error while analyzing your question. This could be due to:\n' +
      '• Temporary service unavailability\n' +
      '• Data access issues\n' +
      '• Complex query timeout\n\n' +
      'Please try again or simplify your question.'
    );
  }
}

/**
 * Check if the financial analyst is properly configured
 * @returns {object} - Status of each component
 */
function checkConfiguration() {
  return {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google_sheets: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
    budget_sheet: !!process.env.GOOGLE_BUDGET_SHEET_ID,
    model_sheet: !!process.env.GOOGLE_FINANCIAL_MODEL_SHEET_ID,
    rillet: !!process.env.RILLET_API_KEY,
    fpa_channel: !!process.env.FPA_CHANNEL_ID
  };
}

module.exports = {
  analyze,
  checkConfiguration
};
