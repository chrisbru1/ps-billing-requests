# PS Billing Requests

A Slack app that helps finance and operations teams submit structured feature requests and bug reports directly to GitHub Issues.

## Features

- `/billing-request` slash command opens a modal form
- Captures: Title, Type, Priority, Description, Steps to Reproduce (for bugs), Acceptance Criteria, and Attachments info
- Automatically creates a formatted GitHub Issue with appropriate labels
- Sends confirmation message with link to the created issue

## Prerequisites

- Node.js 18+
- A Slack workspace where you can install apps
- A GitHub account with access to the target repository
- Heroku account (for deployment)

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** > **From scratch**
3. Name your app (e.g., "Billing Requests") and select your workspace
4. Click **Create App**

### 2. Configure Slack App Settings

#### Enable Socket Mode
1. Go to **Socket Mode** in the left sidebar
2. Toggle **Enable Socket Mode** to On
3. Create an app-level token with `connections:write` scope
4. Save the token as `SLACK_APP_TOKEN` (starts with `xapp-`)

#### Add Bot Token Scopes
1. Go to **OAuth & Permissions**
2. Under **Scopes** > **Bot Token Scopes**, add:
   - `chat:write` - Send messages
   - `commands` - Add slash commands
   - `im:write` - Send DMs to users

#### Create Slash Command
1. Go to **Slash Commands**
2. Click **Create New Command**
3. Configure:
   - Command: `/billing-request`
   - Short Description: `Submit a billing feature request or bug report`
   - Usage Hint: (leave blank)
4. Click **Save**

#### Install App to Workspace
1. Go to **Install App**
2. Click **Install to Workspace**
3. Review permissions and click **Allow**
4. Save the **Bot User OAuth Token** as `SLACK_BOT_TOKEN` (starts with `xoxb-`)

#### Get Signing Secret
1. Go to **Basic Information**
2. Under **App Credentials**, find **Signing Secret**
3. Save it as `SLACK_SIGNING_SECRET`

### 3. Create a GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give it a descriptive name (e.g., "Billing Requests Slack App")
4. Select scopes:
   - `repo` (Full control of private repositories)
5. Click **Generate token**
6. Save the token as `GITHUB_TOKEN`

### 4. Ensure GitHub Labels Exist

Make sure the following labels exist in your `chrisbru1/psbillingapp` repository:

**Type labels:**
- `bug`
- `feature`
- `enhancement`

**Priority labels:**
- `urgent`
- `high`
- `medium`
- `low`

To create labels, go to your repo > Issues > Labels > New label

### 5. Environment Variables

Create a `.env` file in the project root:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
GITHUB_TOKEN=ghp_your-github-token
PORT=3000
```

## Local Development

```bash
# Install dependencies
npm install

# Start the app
npm start

# Or with auto-reload (Node 18+)
npm run dev
```

## Deploy to Heroku

### Initial Setup

```bash
# Login to Heroku
heroku login

# Create a new Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set SLACK_BOT_TOKEN=xoxb-your-bot-token
heroku config:set SLACK_SIGNING_SECRET=your-signing-secret
heroku config:set SLACK_APP_TOKEN=xapp-your-app-token
heroku config:set GITHUB_TOKEN=ghp_your-github-token

# Deploy
git push heroku main
```

### Subsequent Deployments

```bash
git push heroku main
```

## Usage

1. In any Slack channel or DM, type `/billing-request`
2. Fill out the modal form:
   - **Title**: Brief summary of the request
   - **Type**: Bug, Feature, or Enhancement
   - **Priority**: Urgent, High, Medium, or Low
   - **Description**: Detailed explanation
   - **Steps to Reproduce**: (Only shown for bugs) How to reproduce the issue
   - **Acceptance Criteria**: What success looks like
   - **Attachments Info**: (Optional) Reference any files to attach on GitHub
3. Click **Submit**
4. Receive a DM with confirmation and link to the GitHub issue

## Project Structure

```
ps-billing-requests/
├── app.js          # Main application code
├── package.json    # Dependencies and scripts
├── Procfile        # Heroku deployment config
├── .gitignore      # Git ignore rules
├── .env            # Environment variables (not committed)
└── README.md       # This file
```

## Troubleshooting

### App not responding to slash command
- Verify Socket Mode is enabled
- Check that `SLACK_APP_TOKEN` is correct
- Ensure the app is installed to your workspace

### GitHub issue not created
- Verify `GITHUB_TOKEN` has `repo` scope
- Check that the repository name is correct in `app.js`
- Ensure labels exist in the repository

### Permission errors
- Re-install the app to your workspace to update scopes
- Verify bot token scopes include `chat:write`, `commands`, `im:write`

## License

ISC
