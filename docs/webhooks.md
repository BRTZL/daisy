# Webhooks

Daisy can send HTTP notifications to external systems when events occur during loop execution. This enables integration with Slack, Discord, monitoring tools, or custom services.

## Overview

Webhooks:
- Send HTTP POST requests to configured URLs
- Support HMAC-SHA256 signing for security
- Can be filtered by event type
- Include project context in payloads
- Have configurable timeout
- Can be enabled/disabled individually

## Configuration

Webhooks are configured in `.daisy/config.json`:

```json
{
  "webhooks": [
    {
      "name": "Slack Notifications",
      "url": "https://hooks.slack.com/services/T00/B00/xxx",
      "events": ["task_completed", "loop_completed", "error"],
      "active": true,
      "secret": "my-signing-secret"
    },
    {
      "name": "Monitoring System",
      "url": "https://monitor.example.com/webhooks/daisy",
      "events": ["*"],
      "active": true
    }
  ]
}
```

### Webhook Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Display name for the webhook |
| `url` | string | Yes | HTTPS endpoint URL |
| `events` | string[] | Yes | Events to subscribe to |
| `active` | boolean | Yes | Enable/disable webhook |
| `secret` | string | No | HMAC signing secret |

### Event Types

| Event | When Triggered |
|-------|----------------|
| `loop_started` | Loop begins execution |
| `loop_completed` | Loop finishes |
| `iteration_started` | New iteration begins |
| `iteration_completed` | Iteration finishes |
| `task_started` | Task work begins |
| `task_completed` | Task marked complete |
| `task_failed` | Task failed or skipped |
| `error` | Error occurred |
| `*` | Subscribe to all events |

## Payload Format

All webhooks receive payloads in this format:

```json
{
  "event": "task_completed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "project": {
    "name": "my-project",
    "path": "/path/to/project"
  },
  "data": {
    // Event-specific data
  }
}
```

### Event-Specific Data

#### loop_started

```json
{
  "event": "loop_started",
  "data": {
    "maxIterations": 10
  }
}
```

#### loop_completed

```json
{
  "event": "loop_completed",
  "data": {
    "totalIterations": 5,
    "allTasksComplete": true,
    "totalTokens": {
      "input": 75000,
      "output": 25000
    },
    "totalCost": 1.25
  }
}
```

#### iteration_started

```json
{
  "event": "iteration_started",
  "data": {
    "iteration": 3,
    "maxIterations": 10
  }
}
```

#### iteration_completed

```json
{
  "event": "iteration_completed",
  "data": {
    "iteration": 3,
    "maxIterations": 10,
    "tokens": {
      "input": 15000,
      "output": 5000
    },
    "cost": 0.25,
    "complete": false
  }
}
```

#### task_started

```json
{
  "event": "task_started",
  "data": {
    "taskId": "auth-login",
    "taskTitle": "Login Endpoint",
    "iteration": 3
  }
}
```

#### task_completed

```json
{
  "event": "task_completed",
  "data": {
    "taskId": "auth-login",
    "taskTitle": "Login Endpoint",
    "iteration": 3,
    "summary": "Implemented JWT authentication with refresh tokens"
  }
}
```

#### task_failed

```json
{
  "event": "task_failed",
  "data": {
    "taskId": "auth-login",
    "taskTitle": "Login Endpoint",
    "iteration": 3,
    "reason": "Maximum attempts exceeded",
    "attempts": 3
  }
}
```

#### error

```json
{
  "event": "error",
  "data": {
    "message": "Process exited with code 1",
    "iteration": 3
  }
}
```

## Request Headers

Webhook requests include these headers:

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `User-Agent` | `daisy/2.1` |
| `X-Daisy-Event` | Event type (e.g., `task_completed`) |
| `X-Daisy-Delivery` | Unique delivery ID (UUID) |
| `X-Daisy-Signature` | HMAC signature (if secret configured) |

## Signature Verification

If a `secret` is configured, requests are signed using HMAC-SHA256.

### Signature Format

```
X-Daisy-Signature: sha256=<hex-encoded-signature>
```

### Signing Process

```typescript
const signature = crypto
  .createHmac("sha256", secret)
  .update(JSON.stringify(payload))
  .digest("hex");

// Header value
`sha256=${signature}`
```

### Verification Example (Node.js)

```javascript
const crypto = require("crypto");

function verifyWebhook(body, signature, secret) {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express middleware
app.post("/webhook", (req, res) => {
  const signature = req.headers["x-daisy-signature"];
  const isValid = verifyWebhook(
    JSON.stringify(req.body),
    signature,
    process.env.WEBHOOK_SECRET
  );

  if (!isValid) {
    return res.status(401).send("Invalid signature");
  }

  // Process webhook...
  res.status(200).send("OK");
});
```

## Integration Examples

### Slack Integration

Configure an incoming webhook in Slack, then:

```json
{
  "webhooks": [
    {
      "name": "Slack",
      "url": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
      "events": ["task_completed", "loop_completed", "error"],
      "active": true
    }
  ]
}
```

**Note**: Slack incoming webhooks expect a specific format. You may need a proxy service to transform Daisy's payload.

### Slack Proxy Example

```javascript
// Simple proxy that transforms Daisy → Slack format
app.post("/daisy-to-slack", async (req, res) => {
  const { event, data, project } = req.body;

  let text;
  switch (event) {
    case "task_completed":
      text = `:white_check_mark: Task completed: *${data.taskTitle}*\n${data.summary}`;
      break;
    case "loop_completed":
      text = `:rocket: Loop completed!\nIterations: ${data.totalIterations}\nCost: $${data.totalCost.toFixed(2)}`;
      break;
    case "error":
      text = `:x: Error in ${project.name}: ${data.message}`;
      break;
    default:
      text = `Event: ${event}`;
  }

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  res.status(200).send("OK");
});
```

### Discord Integration

Discord webhooks expect a different format:

```javascript
// Proxy for Discord
app.post("/daisy-to-discord", async (req, res) => {
  const { event, data, project } = req.body;

  const embed = {
    title: `Daisy: ${event.replace(/_/g, " ")}`,
    description: getDescription(event, data),
    color: event === "error" ? 0xff0000 : 0x00ff00,
    footer: { text: project.name }
  };

  await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] })
  });

  res.status(200).send("OK");
});
```

### Custom Monitoring

```json
{
  "webhooks": [
    {
      "name": "Internal Monitor",
      "url": "https://monitor.internal.company.com/api/daisy",
      "events": ["*"],
      "active": true,
      "secret": "secure-internal-secret"
    }
  ]
}
```

## Error Handling

### Timeout

Webhook requests have a 10-second timeout. Slow endpoints will fail.

### Retry Policy

Currently, webhooks do **not** retry on failure. Failed deliveries are logged but not retried.

### Verbose Logging

Enable verbose mode to see delivery results:

```typescript
// In WebhookService
if (this.verbose) {
  console.log(`Webhook ${name}: ${success ? "delivered" : "failed"}`);
}
```

## Webhook Service Implementation

The WebhookService manages webhook delivery:

```typescript
class WebhookService {
  // Filter to only active webhooks
  constructor(config: WebhookServiceConfig) {
    this.webhooks = config.webhooks.filter(w => w.active);
  }

  // Emit event to matching webhooks
  async emit(event: WebhookEvent, data: WebhookEventData): Promise<WebhookDeliveryResult[]> {
    const matching = this.getWebhooksForEvent(event);
    return Promise.all(matching.map(w => this.deliver(w, event, data)));
  }

  // Deliver to single webhook
  private async deliver(webhook, event, data): Promise<WebhookDeliveryResult> {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      project: { name: this.projectName, path: this.projectPath },
      data
    };

    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "daisy/2.1",
      "X-Daisy-Event": event,
      "X-Daisy-Delivery": randomUUID()
    };

    if (webhook.secret) {
      headers["X-Daisy-Signature"] = this.sign(JSON.stringify(payload), webhook.secret);
    }

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });

      return {
        webhook: webhook.name,
        success: response.ok,
        statusCode: response.status
      };
    } catch (error) {
      return {
        webhook: webhook.name,
        success: false,
        error: error.message
      };
    }
  }
}
```

## Best Practices

### 1. Use HTTPS

Always use HTTPS URLs for webhook endpoints.

### 2. Implement Signature Verification

Use a secret and verify signatures to prevent spoofed requests.

### 3. Respond Quickly

Webhook endpoints should respond within 10 seconds. Process payloads asynchronously if needed.

### 4. Handle Duplicates

Implement idempotency using `X-Daisy-Delivery` header as a unique ID.

### 5. Filter Events

Subscribe only to events you need to reduce noise.

### 6. Monitor Failures

Log webhook delivery failures for troubleshooting.

## Debugging Webhooks

### Test Endpoint

Use a service like [webhook.site](https://webhook.site) for testing:

```json
{
  "webhooks": [
    {
      "name": "Test",
      "url": "https://webhook.site/unique-id",
      "events": ["*"],
      "active": true
    }
  ]
}
```

### Local Development

Use [ngrok](https://ngrok.com) to expose a local server:

```bash
ngrok http 3000
```

Then use the ngrok URL in your webhook configuration.

### Check Delivery

Look for delivery results in the server logs when verbose mode is enabled.

## Related Documentation

- [Configuration](./configuration.md) - Full config reference
- [Loop Runner](./loop-runner.md) - Event emission
- [Core Concepts](./core-concepts.md) - Event lifecycle
