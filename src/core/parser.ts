/**
 * Claude stream-json output parser
 */

export interface StreamMessage {
  type: "init" | "assistant" | "result" | "system";
  subtype?: "init" | "success" | "error";
  model?: string;
  session_id?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: unknown;
    }>;
  };
  result?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  total_cost_usd?: number;
}

export interface ParseResult {
  type: string;
  text?: string;
  toolName?: string;
  model?: string;
  sessionId?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  isComplete: boolean;
  result?: string;
  totalCostUsd?: number;
}

/**
 * Parse a JSON line from Claude's stream-json output
 */
export function parseLine(line: string): ParseResult | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let msg: StreamMessage;
  try {
    msg = JSON.parse(trimmed) as StreamMessage;
  } catch (_error) {
    // Not a JSON line, ignore
    return null;
  }

  const result: ParseResult = {
    type: msg.type,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    isComplete: false,
  };

  // Extract session_id if present (available in init, assistant, and result messages)
  if (msg.session_id) {
    result.sessionId = msg.session_id;
  }

  switch (msg.type) {
    case "system":
      // System init message contains session_id and model
      if (msg.subtype === "init") {
        result.model = msg.model;
      }
      break;

    case "init":
      result.model = msg.model;
      break;

    case "assistant":
      // Extract text and tool use from content
      if (msg.message?.content) {
        for (const content of msg.message.content) {
          switch (content.type) {
            case "text":
              if (content.text) {
                result.text = content.text;
              }
              break;
            case "tool_use":
              if (content.name) {
                result.toolName = content.name;
              }
              break;
          }
        }
      }
      break;

    case "result":
      // Debug: log raw result message to understand structure
      if (process.env.DEBUG_PARSER) {
        console.error(
          "[parser] Raw result message:",
          JSON.stringify(msg, null, 2)
        );
      }
      result.result = msg.result || "";
      result.inputTokens = msg.usage?.input_tokens || 0;
      result.outputTokens = msg.usage?.output_tokens || 0;
      result.cacheCreateTokens = msg.usage?.cache_creation_input_tokens || 0;
      result.cacheReadTokens = msg.usage?.cache_read_input_tokens || 0;
      result.totalCostUsd = msg.total_cost_usd;

      // Check for completion marker
      if (msg.result?.includes("<promise>COMPLETE</promise>")) {
        result.isComplete = true;
      }
      break;
  }

  return result;
}

/**
 * Simplify long MCP tool names for display
 */
export function parseToolInfo(toolName: string): string {
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    if (parts.length >= 3) {
      return parts[parts.length - 1];
    }
  }
  return toolName;
}

/**
 * Parse stream from Claude Code process
 */
export class StreamParser {
  private buffer = "";

  /**
   * Parse data chunk from stdout
   */
  parse(chunk: string): ParseResult[] {
    this.buffer += chunk;
    const results: ParseResult[] = [];

    const lines = this.buffer.split("\n");
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const result = parseLine(line);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = "";
  }

  /**
   * Flush any remaining data in the buffer (call when stream ends)
   */
  flush(): ParseResult | null {
    if (this.buffer.trim()) {
      const result = parseLine(this.buffer);
      this.buffer = "";
      return result;
    }
    return null;
  }
}
