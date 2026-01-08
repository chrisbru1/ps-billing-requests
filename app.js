require('dotenv').config();

const { App } = require('@slack/bolt');
const { Octokit } = require('@octokit/rest');
const http = require('http');
const crypto = require('crypto');

// Financial Analyst module
const financialAnalyst = require('./financial-analyst');

// Initialize Slack Bolt app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Initialize GitHub client (must be before functions that use it)
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// GitHub repo configuration
const GITHUB_OWNER = 'chrisbru1';
const GITHUB_REPO = 'psbillingapp';

// Slack channel for non-Slack-created PR notifications
const PR_NOTIFICATION_CHANNEL = process.env.PR_NOTIFICATION_CHANNEL || 'ps-billing-app-testing';

// FPA channels for financial analyst bot (access-controlled, comma-separated)
const FPA_CHANNEL_IDS = process.env.FPA_CHANNEL_ID
  ? process.env.FPA_CHANNEL_ID.split(',').map(id => id.trim())
  : [];

// Verify GitHub webhook signature
function verifyGitHubSignature(payload, signature) {
  if (!process.env.GITHUB_WEBHOOK_SECRET) return true; // Skip if not configured
  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// Extract Slack metadata from issue body (channel ID and message timestamp for threading)
function extractSlackMetadata(issueBody) {
  const channelMatch = issueBody?.match(/<!-- slack_channel:(\w+) -->/);
  const tsMatch = issueBody?.match(/<!-- slack_thread_ts:([\d.]+) -->/);
  return {
    channelId: channelMatch ? channelMatch[1] : null,
    threadTs: tsMatch ? tsMatch[1] : null,
  };
}

// Extract issue numbers from PR body (looks for "Fixes #123", "Closes #123", etc.)
function extractLinkedIssues(prBody) {
  if (!prBody) return [];
  const patterns = [
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*#(\d+)/gi,
    /#(\d+)/g // Also match plain issue references
  ];

  const issues = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(prBody)) !== null) {
      issues.add(parseInt(match[1], 10));
    }
  }
  return Array.from(issues);
}

// Build PR notification blocks
function buildPRNotificationBlocks(pr, action, issueInfo = null) {
  let message, emoji;
  if (action === 'opened') {
    emoji = ':rocket:';
    message = issueInfo
      ? `*Pull request opened for issue #${issueInfo.number}*`
      : `*Pull request opened*`;
  } else {
    emoji = ':white_check_mark:';
    message = issueInfo
      ? `*Pull request merged for issue #${issueInfo.number}*`
      : `*Pull request merged*`;
  }

  // Truncate PR body if too long (Slack has limits)
  let prBody = pr.body || '_No description provided_';
  // Remove the issue reference patterns from the body for cleaner display
  prBody = prBody.replace(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*#\d+/gi, '').trim();
  // Remove Claude Code generated footer
  prBody = prBody.replace(/🤖\s*Generated with \[Claude Code\]\(https:\/\/claude\.com\/claude-code\)/gi, '').trim();
  prBody = prBody.replace(/Co-Authored-By:.*$/gim, '').trim();
  if (prBody.length > 1500) {
    prBody = prBody.substring(0, 1500) + '...';
  }
  if (!prBody) prBody = '_No additional description_';

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} ${message}`,
      },
    },
  ];

  // Add issue link if this is linked to a Slack-created issue
  if (issueInfo) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Issue:*\n<${issueInfo.html_url}|#${issueInfo.number}: ${issueInfo.title}>`,
        },
        {
          type: 'mrkdwn',
          text: `*PR:*\n<${pr.html_url}|#${pr.number}: ${pr.title}>`,
        },
      ],
    });
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${pr.html_url}|#${pr.number}: ${pr.title}>*`,
      },
    });
  }

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: prBody,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${action === 'opened' ? 'Opened' : 'Merged'} by *${pr.user.login}*`,
        },
      ],
    }
  );

  // Add merge commit info if merged
  if (action === 'closed' && pr.merged) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Merged into \`${pr.base.ref}\` from \`${pr.head.ref}\``,
        },
      ],
    });
  }

  return { blocks, message };
}

// Get Slack thread info from PR comment (for threading merge under open notification)
async function getPRSlackThread(prNumber) {
  try {
    const { data: comments } = await octokit.issues.listComments({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: prNumber,
    });

    // Look for our bot comment with Slack metadata
    for (const comment of comments) {
      const channelMatch = comment.body.match(/<!-- slack_pr_channel:([\w-]+) -->/);
      const tsMatch = comment.body.match(/<!-- slack_pr_thread_ts:([\d.]+) -->/);
      if (channelMatch && tsMatch) {
        return { channelId: channelMatch[1], threadTs: tsMatch[1] };
      }
    }
  } catch (error) {
    console.error(`Failed to get PR comments for #${prNumber}:`, error.message);
  }
  return null;
}

// Save Slack thread info to PR comment (for threading merge under open notification)
async function savePRSlackThread(prNumber, channelId, threadTs) {
  console.log(`Saving Slack thread info for PR #${prNumber}: channel=${channelId}, ts=${threadTs}`);
  try {
    const result = await octokit.issues.createComment({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: prNumber,
      body: `Slack notification sent.\n\n<!-- slack_pr_channel:${channelId} -->\n<!-- slack_pr_thread_ts:${threadTs} -->`,
    });
    console.log(`Successfully saved PR Slack thread comment for #${prNumber}, comment ID: ${result.data.id}`);
  } catch (error) {
    console.error(`Failed to save PR Slack thread for #${prNumber}:`, error.message);
    console.error('Full error:', error);
  }
}

// Handle GitHub webhook events
async function handleGitHubWebhook(event, payload) {
  if (event !== 'pull_request') return;

  const action = payload.action;
  const pr = payload.pull_request;

  // Only handle PR opened and merged events
  if (action !== 'opened' && !(action === 'closed' && pr.merged)) return;

  // Extract linked issue numbers from PR body
  const linkedIssues = extractLinkedIssues(pr.body);

  // Track if we found any Slack-created issues
  let notifiedSlackThread = false;

  // For each linked issue, try to notify the Slack channel
  for (const issueNumber of linkedIssues) {
    try {
      // Fetch the issue to get the Slack metadata from the body
      const { data: issue } = await octokit.issues.get({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        issue_number: issueNumber,
      });

      const { channelId, threadTs } = extractSlackMetadata(issue.body);
      if (!channelId) continue;

      // This is a Slack-created issue - notify in thread
      notifiedSlackThread = true;

      const { blocks, message } = buildPRNotificationBlocks(pr, action, {
        number: issueNumber,
        title: issue.title,
        html_url: issue.html_url,
      });

      // Send notification to Slack
      const messageOptions = {
        channel: channelId,
        text: `${message}: ${pr.title}`,
        blocks,
        unfurl_links: false,
        unfurl_media: false,
      };

      // For merged PRs, try to thread under the "opened" notification first
      if (action === 'closed' && pr.merged) {
        const prThread = await getPRSlackThread(pr.number);
        if (prThread && prThread.channelId === channelId) {
          messageOptions.thread_ts = prThread.threadTs;
        } else if (threadTs) {
          // Fall back to threading under the original issue request
          messageOptions.thread_ts = threadTs;
        }
      } else if (threadTs) {
        // For opened PRs, thread under the original issue request
        messageOptions.thread_ts = threadTs;
      }

      const result = await app.client.chat.postMessage(messageOptions);

      // For opened PRs, save the message ts so merge can thread under it
      if (action === 'opened' && result.ts) {
        await savePRSlackThread(pr.number, channelId, result.ts);
      }

      console.log(`Notified channel ${channelId} about PR #${pr.number} for issue #${issueNumber}${messageOptions.thread_ts ? ' (threaded)' : ''}`);
    } catch (error) {
      console.error(`Failed to notify for issue #${issueNumber}:`, error.message);
    }
  }

  // If no Slack-created issues were found, post to the general PR channel
  if (!notifiedSlackThread) {
    try {
      const { blocks, message } = buildPRNotificationBlocks(pr, action);

      // For merged PRs, check if we have a thread to reply to
      let threadTs = null;
      if (action === 'closed' && pr.merged) {
        const prThread = await getPRSlackThread(pr.number);
        if (prThread) {
          threadTs = prThread.threadTs;
        }
      }

      const messageOptions = {
        channel: PR_NOTIFICATION_CHANNEL,
        text: `${message}: ${pr.title}`,
        blocks,
        unfurl_links: false,
        unfurl_media: false,
      };

      if (threadTs) {
        messageOptions.thread_ts = threadTs;
      }

      const result = await app.client.chat.postMessage(messageOptions);

      // For opened PRs, save the message ts so merge can thread under it
      if (action === 'opened' && result.ts) {
        await savePRSlackThread(pr.number, PR_NOTIFICATION_CHANNEL, result.ts);
      }

      console.log(`Notified ${PR_NOTIFICATION_CHANNEL} about PR #${pr.number}${threadTs ? ' (threaded)' : ''}`);
    } catch (error) {
      console.error(`Failed to notify ${PR_NOTIFICATION_CHANNEL}:`, error.message);
    }
  }
}

// HTTP server for health checks and GitHub webhooks
const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Billing Requests app is running');
    return;
  }

  // GitHub webhook endpoint
  if (req.method === 'POST' && req.url === '/github-webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        // Verify signature
        const signature = req.headers['x-hub-signature-256'];
        if (!verifyGitHubSignature(body, signature)) {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Invalid signature');
          return;
        }

        const event = req.headers['x-github-event'];
        const payload = JSON.parse(body);

        // Process webhook asynchronously
        handleGitHubWebhook(event, payload).catch(console.error);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch (error) {
        console.error('Webhook error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal error');
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// Build the modal view
function buildModalView(showStepsToReproduce = false) {
  const blocks = [
    {
      type: 'input',
      block_id: 'title_block',
      element: {
        type: 'plain_text_input',
        action_id: 'title_input',
        placeholder: {
          type: 'plain_text',
          text: 'Enter a brief title for your request',
        },
      },
      label: {
        type: 'plain_text',
        text: 'Title',
      },
    },
    {
      type: 'input',
      block_id: 'type_block',
      element: {
        type: 'static_select',
        action_id: 'type_select',
        placeholder: {
          type: 'plain_text',
          text: 'Select type',
        },
        options: [
          {
            text: { type: 'plain_text', text: 'Bug' },
            value: 'bug',
          },
          {
            text: { type: 'plain_text', text: 'Feature' },
            value: 'feature',
          },
          {
            text: { type: 'plain_text', text: 'Enhancement' },
            value: 'enhancement',
          },
        ],
      },
      label: {
        type: 'plain_text',
        text: 'Type',
      },
    },
    {
      type: 'input',
      block_id: 'priority_block',
      element: {
        type: 'static_select',
        action_id: 'priority_select',
        placeholder: {
          type: 'plain_text',
          text: 'Select priority',
        },
        options: [
          {
            text: { type: 'plain_text', text: 'Urgent' },
            value: 'urgent',
          },
          {
            text: { type: 'plain_text', text: 'High' },
            value: 'high',
          },
          {
            text: { type: 'plain_text', text: 'Medium' },
            value: 'medium',
          },
          {
            text: { type: 'plain_text', text: 'Low' },
            value: 'low',
          },
        ],
      },
      label: {
        type: 'plain_text',
        text: 'Priority',
      },
    },
    {
      type: 'input',
      block_id: 'description_block',
      element: {
        type: 'plain_text_input',
        action_id: 'description_input',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: 'Describe the issue or feature request in detail',
        },
      },
      label: {
        type: 'plain_text',
        text: 'Description',
      },
    },
  ];

  // Conditionally add "Steps to Reproduce" field for bugs
  if (showStepsToReproduce) {
    blocks.push({
      type: 'input',
      block_id: 'steps_block',
      element: {
        type: 'plain_text_input',
        action_id: 'steps_input',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: '1. Go to...\n2. Click on...\n3. Observe that...',
        },
      },
      label: {
        type: 'plain_text',
        text: 'Steps to Reproduce',
      },
      optional: true,
    });
  }

  // Add remaining fields
  blocks.push(
    {
      type: 'input',
      block_id: 'acceptance_block',
      element: {
        type: 'plain_text_input',
        action_id: 'acceptance_input',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: 'What should happen when this is complete?',
        },
      },
      label: {
        type: 'plain_text',
        text: 'Acceptance Criteria',
      },
    },
    {
      type: 'input',
      block_id: 'attachments_block',
      element: {
        type: 'plain_text_input',
        action_id: 'attachments_input',
        placeholder: {
          type: 'plain_text',
          text: 'List any files you will attach to the GitHub issue',
        },
      },
      label: {
        type: 'plain_text',
        text: 'Attachments Info',
      },
      optional: true,
    }
  );

  return {
    type: 'modal',
    callback_id: 'billing_request_modal',
    title: {
      type: 'plain_text',
      text: 'Billing Request',
    },
    submit: {
      type: 'plain_text',
      text: 'Submit',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks,
  };
}

// Handle the /billingapp-request slash command
app.command('/billingapp-request', async ({ ack, body, client, logger }) => {
  await ack();

  try {
    const view = buildModalView(false);
    // Store channel ID in private_metadata to post confirmation there
    view.private_metadata = JSON.stringify({ channel_id: body.channel_id });

    await client.views.open({
      trigger_id: body.trigger_id,
      view,
    });
  } catch (error) {
    logger.error('Error opening modal:', error);
  }
});

// Handle type selection to show/hide "Steps to Reproduce"
app.action('type_select', async ({ ack, body, client, logger }) => {
  await ack();

  try {
    const selectedType = body.actions[0].selected_option.value;
    const showSteps = selectedType === 'bug';

    // Get current values from the view
    const currentView = body.view;
    const currentValues = currentView.state.values;

    // Build updated view
    const updatedView = buildModalView(showSteps);
    // Preserve private_metadata (channel ID)
    updatedView.private_metadata = currentView.private_metadata;

    // Preserve existing input values
    if (currentValues.title_block?.title_input?.value) {
      updatedView.blocks[0].element.initial_value =
        currentValues.title_block.title_input.value;
    }
    if (currentValues.type_block?.type_select?.selected_option) {
      updatedView.blocks[1].element.initial_option =
        currentValues.type_block.type_select.selected_option;
    }
    if (currentValues.priority_block?.priority_select?.selected_option) {
      updatedView.blocks[2].element.initial_option =
        currentValues.priority_block.priority_select.selected_option;
    }
    if (currentValues.description_block?.description_input?.value) {
      updatedView.blocks[3].element.initial_value =
        currentValues.description_block.description_input.value;
    }

    // Preserve steps to reproduce if switching back to bug and value exists
    if (showSteps && currentValues.steps_block?.steps_input?.value) {
      updatedView.blocks[4].element.initial_value =
        currentValues.steps_block.steps_input.value;
    }

    // Preserve acceptance criteria and attachments
    const acceptanceIndex = showSteps ? 5 : 4;
    const attachmentsIndex = showSteps ? 6 : 5;

    if (currentValues.acceptance_block?.acceptance_input?.value) {
      updatedView.blocks[acceptanceIndex].element.initial_value =
        currentValues.acceptance_block.acceptance_input.value;
    }
    if (currentValues.attachments_block?.attachments_input?.value) {
      updatedView.blocks[attachmentsIndex].element.initial_value =
        currentValues.attachments_block.attachments_input.value;
    }

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: updatedView,
    });
  } catch (error) {
    logger.error('Error updating modal:', error);
  }
});

// Handle modal submission
app.view('billing_request_modal', async ({ ack, body, view, client, logger }) => {
  const values = view.state.values;

  // Extract form values
  const title = values.title_block.title_input.value;
  const type = values.type_block.type_select.selected_option.value;
  const priority = values.priority_block.priority_select.selected_option.value;
  const description = values.description_block.description_input.value;
  const stepsToReproduce = values.steps_block?.steps_input?.value || null;
  const acceptanceCriteria = values.acceptance_block.acceptance_input.value;
  const attachmentsInfo = values.attachments_block?.attachments_input?.value || null;

  // Get user info and channel
  const userId = body.user.id;
  const metadata = JSON.parse(view.private_metadata || '{}');
  const channelId = metadata.channel_id;

  try {
    // Build GitHub issue body
    let issueBody = `## Description\n${description}\n\n`;

    if (type === 'bug' && stepsToReproduce) {
      issueBody += `## Steps to Reproduce\n${stepsToReproduce}\n\n`;
    }

    issueBody += `## Acceptance Criteria\n${acceptanceCriteria}\n\n`;

    if (attachmentsInfo) {
      issueBody += `## Attachments\n${attachmentsInfo}\n\n`;
    }

    issueBody += `---\n`;
    issueBody += `**Priority:** ${priority.charAt(0).toUpperCase() + priority.slice(1)}\n`;
    issueBody += `**Type:** ${type.charAt(0).toUpperCase() + type.slice(1)}\n`;
    issueBody += `**Submitted via:** Slack by <@${userId}>\n\n`;
    // Hidden metadata for webhook notifications (HTML comment not rendered in GitHub)
    issueBody += `<!-- slack_channel:${channelId} -->`;

    // Create labels array
    const labels = [type, priority];

    // Create GitHub issue (without thread_ts initially)
    const { data: issue } = await octokit.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: title,
      body: issueBody,
      labels: labels,
    });

    // Acknowledge the submission
    await ack();

    // Send confirmation message to channel
    const messageResult = await client.chat.postMessage({
      channel: channelId,
      text: `Billing request submitted by <@${userId}>`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Billing request submitted by <@${userId}>*`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Title:*\n${title}`,
            },
            {
              type: 'mrkdwn',
              text: `*Type:*\n${type.charAt(0).toUpperCase() + type.slice(1)}`,
            },
            {
              type: 'mrkdwn',
              text: `*Priority:*\n${priority.charAt(0).toUpperCase() + priority.slice(1)}`,
            },
            {
              type: 'mrkdwn',
              text: `*Issue #:*\n${issue.number}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${issue.html_url}|View Issue on GitHub>`,
          },
        },
      ],
    });

    // Update the GitHub issue with the Slack message timestamp for threading
    if (messageResult.ts) {
      const updatedBody = issueBody + `\n<!-- slack_thread_ts:${messageResult.ts} -->`;
      await octokit.issues.update({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        issue_number: issue.number,
        body: updatedBody,
      });
    }

    logger.info(`Created GitHub issue #${issue.number}: ${title}`);
  } catch (error) {
    logger.error('Error creating GitHub issue:', error);

    // Acknowledge with error
    await ack({
      response_action: 'errors',
      errors: {
        title_block: 'Failed to create GitHub issue. Please try again or contact support.',
      },
    });
  }
});

// Handle /fpabot slash command for FPA Financial Analyst
app.command('/fpabot', async ({ command, ack, client, logger }) => {
  // Acknowledge immediately (Slack requires response within 3 seconds)
  await ack();

  // SECURITY: Only respond in designated FPA channels
  if (FPA_CHANNEL_IDS.length === 0) {
    logger.warn('FPA_CHANNEL_ID not configured');
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: ':warning: FPA Bot is not configured. Please contact the administrator.'
    });
    return;
  }

  if (!FPA_CHANNEL_IDS.includes(command.channel_id)) {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: ':lock: This command is only available in authorized FPA channels.'
    });
    return;
  }

  const question = command.text.trim();

  // If no question provided, show help
  if (!question) {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '*FPA Financial Analyst*\n\nUsage: `/fpabot <your question>`\n\nExamples:\n• `/fpabot What are our revenue projections for Q1?`\n• `/fpabot Show me the assumptions in our financial model`\n• `/fpabot What\'s our current cash position?`\n• `/fpabot help` - Show full guide'
    });
    return;
  }

  try {
    // Post "thinking" indicator as a visible message
    const thinkingMsg = await client.chat.postMessage({
      channel: command.channel_id,
      text: `:hourglass_flowing_sand: <@${command.user_id}> asked: "${question.substring(0, 100)}${question.length > 100 ? '...' : ''}"`,
      blocks: [
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `<@${command.user_id}> asked: _${question}_`
          }]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':hourglass_flowing_sand: *Analyzing...*'
          }
        }
      ]
    });

    logger.info(`[FPA Bot] Processing question from ${command.user_id}: ${question.substring(0, 100)}...`);

    // Process with financial analyst (use thinkingMsg.ts as the thread for conversation continuity)
    const response = await financialAnalyst.analyze(question, {
      userId: command.user_id,
      channelId: command.channel_id,
      threadTs: thinkingMsg.ts
    });

    // Update the "thinking" message with the actual response
    // Prepend the question context to the response blocks
    const responseBlocks = [
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `<@${command.user_id}> asked: _${question}_`
        }]
      },
      { type: 'divider' },
      ...response.blocks
    ];

    await client.chat.update({
      channel: command.channel_id,
      ts: thinkingMsg.ts,
      text: response.text,
      blocks: responseBlocks
    });

    logger.info(`[FPA Bot] Successfully responded to ${command.user_id}`);

  } catch (error) {
    logger.error('[FPA Bot] Error processing question:', error);

    await client.chat.postMessage({
      channel: command.channel_id,
      text: ':x: Sorry, I encountered an error analyzing your question. Please try again.',
      blocks: [
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `<@${command.user_id}> asked: _${question}_`
          }]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':warning: *Unable to process your question*\n\nI encountered an unexpected error. Please try:\n• Rephrasing your question\n• Asking a simpler question\n• Trying again in a few moments'
          }
        }
      ]
    });
  }
});

// Handle thread replies to FPA Bot messages
// This enables conversation continuity - users can reply in the thread to ask follow-up questions
app.message(async ({ message, client, logger }) => {
  // Only process messages that are in a thread (have thread_ts)
  if (!message.thread_ts) return;

  // Ignore bot messages to prevent loops
  if (message.bot_id || message.subtype === 'bot_message') return;

  // Only respond in FPA channels
  if (!FPA_CHANNEL_IDS.includes(message.channel)) return;

  // Check if the thread was started by the bot (our messages have the question context)
  // We look for threads where we've previously responded
  try {
    // Get the parent message to verify it's an FPA Bot thread
    const result = await client.conversations.replies({
      channel: message.channel,
      ts: message.thread_ts,
      limit: 1
    });

    const parentMessage = result.messages?.[0];
    if (!parentMessage) return;

    // Check if parent message has our FPA Bot signature (context block with "asked:")
    const hasContext = parentMessage.blocks?.some(block =>
      block.type === 'context' &&
      block.elements?.some(el => el.text?.includes('asked:'))
    );

    if (!hasContext) return;

    const question = message.text?.trim();
    if (!question) return;

    logger.info(`[FPA Bot] Thread reply from ${message.user}: ${question.substring(0, 100)}...`);

    // Post thinking indicator in the thread
    const thinkingMsg = await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.thread_ts,
      text: ':hourglass_flowing_sand: Analyzing...'
    });

    // Process with financial analyst (pass the original thread_ts to maintain conversation history)
    const response = await financialAnalyst.analyze(question, {
      userId: message.user,
      channelId: message.channel,
      threadTs: message.thread_ts
    });

    // Update thinking message with response
    await client.chat.update({
      channel: message.channel,
      ts: thinkingMsg.ts,
      text: response.text,
      blocks: response.blocks
    });

    logger.info(`[FPA Bot] Thread reply response sent to ${message.user}`);

  } catch (error) {
    logger.error('[FPA Bot] Error handling thread reply:', error);

    // Post error message in thread
    await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.thread_ts,
      text: ':warning: Sorry, I encountered an error processing your follow-up question. Please try again.'
    });
  }
});

// Start the app
(async () => {
  const port = process.env.PORT || 3000;

  // Start HTTP server for Heroku health checks
  server.listen(port, () => {
    console.log(`HTTP health check server listening on port ${port}`);
  });

  // Start Slack app (Socket Mode connects via WebSocket)
  await app.start();
  console.log('Slack app connected via Socket Mode');
})();
