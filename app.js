require('dotenv').config();

const { App } = require('@slack/bolt');
const { Octokit } = require('@octokit/rest');
const http = require('http');

// Initialize Slack Bolt app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Simple HTTP server for Heroku health checks
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Billing Requests app is running');
});

// Initialize GitHub client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// GitHub repo configuration
const GITHUB_OWNER = 'chrisbru1';
const GITHUB_REPO = 'psbillingapp';

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
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildModalView(false),
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

  // Get user info
  const userId = body.user.id;

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
    issueBody += `**Submitted via:** Slack by <@${userId}>`;

    // Create labels array
    const labels = [type, priority];

    // Create GitHub issue
    const { data: issue } = await octokit.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: title,
      body: issueBody,
      labels: labels,
    });

    // Acknowledge the submission
    await ack();

    // Send confirmation message to user
    await client.chat.postMessage({
      channel: userId,
      text: `Your billing request has been submitted successfully!`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Your billing request has been submitted!*`,
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
