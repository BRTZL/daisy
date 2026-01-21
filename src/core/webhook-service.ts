/**
 * Webhook service for sending event notifications
 */

import crypto from "node:crypto";
import type { WebhookConfig } from "../storage/global.js";
import type {
  WebhookDeliveryResult,
  WebhookEvent,
  WebhookEventData,
  WebhookPayload,
} from "./webhook-types.js";

/**
 * Configuration for WebhookService
 */
export interface WebhookServiceConfig {
  webhooks: WebhookConfig[];
  projectName: string;
  projectPath: string;
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Whether to log delivery results (default: false) */
  verbose?: boolean;
}

/**
 * Service for managing and delivering webhook notifications
 */
export class WebhookService {
  private webhooks: WebhookConfig[];
  private projectName: string;
  private projectPath: string;
  private timeout: number;
  private verbose: boolean;

  constructor(config: WebhookServiceConfig) {
    // Only keep active webhooks
    this.webhooks = config.webhooks.filter((w) => w.active);
    this.projectName = config.projectName;
    this.projectPath = config.projectPath;
    this.timeout = config.timeout ?? 10000;
    this.verbose = config.verbose ?? false;
  }

  /**
   * Check if there are any active webhooks configured
   */
  hasWebhooks(): boolean {
    return this.webhooks.length > 0;
  }

  /**
   * Get webhooks that are subscribed to a specific event
   */
  getWebhooksForEvent(event: WebhookEvent): WebhookConfig[] {
    return this.webhooks.filter((w) => w.events.includes(event));
  }

  /**
   * Emit an event to all subscribed webhooks
   * @returns Array of delivery results
   */
  async emit(
    event: WebhookEvent,
    data: WebhookEventData
  ): Promise<WebhookDeliveryResult[]> {
    const matchingWebhooks = this.getWebhooksForEvent(event);

    if (matchingWebhooks.length === 0) {
      return [];
    }

    // Deliver to all matching webhooks in parallel
    const results = await Promise.all(
      matchingWebhooks.map((webhook) => this.deliver(webhook, event, data))
    );

    // Log results if verbose
    if (this.verbose) {
      for (const result of results) {
        if (result.success) {
          console.log(
            `[Webhook] ${result.webhook}: delivered ${event} (${result.duration}ms)`
          );
        } else {
          console.error(
            `[Webhook] ${result.webhook}: failed - ${result.error}`
          );
        }
      }
    }

    return results;
  }

  /**
   * Deliver a webhook payload to a single endpoint
   */
  private async deliver(
    webhook: WebhookConfig,
    event: WebhookEvent,
    data: WebhookEventData
  ): Promise<WebhookDeliveryResult> {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      project: {
        name: this.projectName,
        path: this.projectPath,
      },
      data,
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "daisy/2.1",
      "X-Daisy-Event": event,
      "X-Daisy-Delivery": crypto.randomUUID(),
    };

    // Add HMAC signature if secret is provided
    if (webhook.secret) {
      const signature = this.sign(body, webhook.secret);
      headers["X-Daisy-Signature"] = signature;
    }

    const start = Date.now();

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(this.timeout),
      });

      return {
        webhook: webhook.name,
        success: response.ok,
        statusCode: response.status,
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        webhook: webhook.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Generate HMAC-SHA256 signature for payload
   */
  private sign(payload: string, secret: string): string {
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return `sha256=${signature}`;
  }

  /**
   * Verify a webhook signature (for testing/validation)
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const expectedSignature = `sha256=${expected}`;

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }
}

/**
 * Create a webhook service from project config
 */
export function createWebhookService(
  webhooks: WebhookConfig[] | undefined,
  projectName: string,
  projectPath: string,
  options?: { timeout?: number; verbose?: boolean }
): WebhookService | null {
  if (!webhooks || webhooks.length === 0) {
    return null;
  }

  const activeWebhooks = webhooks.filter((w) => w.active);
  if (activeWebhooks.length === 0) {
    return null;
  }

  return new WebhookService({
    webhooks,
    projectName,
    projectPath,
    ...options,
  });
}
