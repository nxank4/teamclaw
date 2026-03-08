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

## Example: Founder at a café

Set `WEBHOOK_ON_TASK_COMPLETE` to a Discord webhook. When the Frontend bot completes the Login page:

- You get a Discord notification on your phone
- The message can include a link (e.g. ngrok URL) to review the result
- You can add that link to the webhook payload by customising the server or using a Zapier/n8n workflow
