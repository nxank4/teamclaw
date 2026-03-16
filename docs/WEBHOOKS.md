# TeamClaw Webhooks

TeamClaw can POST events to external URLs when tasks complete or cycles end. Use this to notify your team on Discord, Slack, or Telegram.

## Configuration

Set these in `.env` or `teamclaw.config.json`:

- `WEBHOOK_ON_TASK_COMPLETE` — URL for task completion events
- `WEBHOOK_ON_CYCLE_END` — URL for cycle end events
- `WEBHOOK_SECRET` — Optional; sent as `X-Webhook-Signature` for verification

## Payload Format

### task_complete

```json
{
  "event": "task_complete",
  "task_id": "TASK-001",
  "success": true,
  "output": "Implemented feature X",
  "quality_score": 0.85,
  "assigned_to": "bot_0",
  "description": "Implement login API",
  "bot_id": "bot_0",
  "timestamp": "2026-03-08T12:00:00.000Z"
}
```

### cycle_end

```json
{
  "event": "cycle_end",
  "cycle": 3,
  "max_cycles": 10,
  "tasks_completed": 5,
  "tasks_failed": 0,
  "timestamp": "2026-03-08T12:01:00.000Z"
}
```

---

## Discord

1. In your Discord server: **Server Settings → Integrations → Webhooks**
2. **New Webhook**, name it (e.g. "TeamClaw")
3. Copy the **Webhook URL**
4. Set in `.env`:

```env
WEBHOOK_ON_TASK_COMPLETE=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
WEBHOOK_ON_CYCLE_END=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
```

Discord expects a JSON body with `content` or `embeds`. TeamClaw sends raw JSON; for a nicer display, use an intermediary (e.g. Zapier, n8n) or a small proxy that converts the payload to Discord's format.

---

## Slack

1. Go to [Slack API](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. **Incoming Webhooks** → **Activate** → **Add New Webhook to Workspace**
3. Copy the Webhook URL
4. Set in `.env`:

```env
WEBHOOK_ON_TASK_COMPLETE=https://hooks.slack.com/services/T00/B00/xxx
```

Slack expects `{ "text": "..." }`. TeamClaw sends the full event object. To render it in Slack, use a small proxy that maps the payload to `{ "text": "Task TASK-001 completed by bot_0: ..." }`, or use Slack's Block Kit if you need rich formatting.

---

## Telegram

1. Message [@BotFather](https://t.me/BotFather) to create a bot
2. Create a group, add your bot, get the chat ID (e.g. via [getUpdates](https://core.telegram.org/bots/api#getupdates))
3. Use: `https://api.telegram.org/bot<TOKEN>/sendMessage`
4. TeamClaw sends JSON; Telegram expects form-encoded or JSON with `chat_id` and `text`

Use a small proxy that:
- Receives TeamClaw's POST
- Extracts the payload
- Calls Telegram: `POST .../sendMessage` with `{ "chat_id": "...", "text": "Task X completed" }`

---

---

## Approval Webhooks

TeamClaw supports async webhook-based approvals. When tasks need review, TeamClaw POSTs approval requests to an external URL (Slack, generic webhook), then waits for a signed callback. No one needs to be at the terminal or dashboard.

### Approval Configuration

Add to `~/.teamclaw/config.json`:

```json
{
  "webhookApproval": {
    "url": "https://hooks.slack.com/services/T00/B00/xxx",
    "secret": "your-hmac-signing-secret",
    "provider": "slack",
    "timeoutSeconds": 300,
    "retryAttempts": 3
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string | required | Endpoint to POST approval requests to |
| `secret` | string | required | HMAC-SHA256 signing secret for tokens and webhook signatures |
| `provider` | `"generic"` \| `"slack"` | `"generic"` | `slack` formats payloads as Slack Block Kit messages |
| `timeoutSeconds` | number | `300` | Auto-escalate tasks after this many seconds without response |
| `retryAttempts` | number | `3` | Retry failed webhook deliveries with exponential backoff |

### CLI Usage

```bash
# Run with async webhook approvals
teamclaw work --async

# Override timeout (in minutes)
teamclaw work --async --async-timeout 10
```

The `--async` flag activates webhook approvals. The web server stays running to receive callbacks.

### Approval Flow

1. `partial_approval` node triggers the webhook provider
2. Provider generates HMAC-signed tokens per task per action (approve/reject/escalate)
3. Provider POSTs approval request to webhook URL with `X-Webhook-Signature: sha256=<hex>` header
4. External system clicks button or calls back to `POST /webhook/approval`
5. Server validates HMAC, checks expiry, checks one-time use
6. Task promise resolves and the graph continues
7. On timeout, the task is auto-escalated

### Outbound Approval Payload

```json
{
  "event": "approval_request",
  "sessionId": "uuid",
  "taskId": "task-1",
  "task": {
    "description": "Build login page",
    "assignedTo": "worker-1",
    "confidence": 0.85,
    "resultPreview": "First 500 chars of output...",
    "reworkCount": 0
  },
  "callbackUrl": "http://localhost:9001/webhook/approval",
  "expiresAt": 1710000000000,
  "approveToken": "base64url.hmac-hex",
  "rejectToken": "base64url.hmac-hex",
  "escalateToken": "base64url.hmac-hex"
}
```

### Callback Format

```
POST /webhook/approval
Content-Type: application/json

{
  "token": "base64url.hmac-hex",
  "feedback": "Optional, required for reject",
  "respondedBy": "Optional, who approved"
}
```

**Response Codes:**

| Code | Meaning |
|------|---------|
| 200 | Approval processed |
| 400 | Missing token or feedback required for rejection |
| 401 | Invalid or expired token |
| 404 | Session no longer active or task not pending |
| 409 | Token already consumed (replay attack) |

### Slack Approval Setup

1. Create a Slack Incoming Webhook for your channel
2. Set `provider: "slack"` and `url` to the webhook URL
3. Set a strong `secret` (e.g., `openssl rand -hex 32`)
4. Run `teamclaw work --async`

Approval requests appear as Block Kit messages with Approve/Reject/Escalate buttons. Clicking a button opens a browser page that auto-submits the approval callback. No Slack app interactivity setup required.

### Token Security

- Tokens are `base64url(JSON payload).hex(HMAC-SHA256(secret, payload))`
- Each token encodes: `taskId`, `action`, `sessionId`, `expiresAt`
- Tokens are one-time use (consumed set tracked in memory)
- Expired entries are pruned automatically
- Outbound webhooks are signed with `X-Webhook-Signature: sha256=<hex>`

### Timeout Behavior

When a task's approval times out:
1. The task is auto-escalated to the next sprint
2. A timeout notification is sent to the webhook URL
3. A warning is logged

### Fallback

If webhook delivery fails after all retry attempts:
- If the dashboard is running, falls back to dashboard-based approval
- If no fallback is available, auto-approves with a warning logged

---

## Example: Founder at a café

Set `WEBHOOK_ON_TASK_COMPLETE` to a Discord webhook. When the Frontend bot completes the Login page:

- You get a Discord notification on your phone
- The message can include a link (e.g. ngrok URL) to review the result
- You can add that link to the webhook payload by customising the server or using a Zapier/n8n workflow
