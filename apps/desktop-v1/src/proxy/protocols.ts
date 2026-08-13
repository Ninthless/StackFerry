import type { ProxyEvent } from "../shared/proxy";

export type ProtocolFormat =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages"
  | "gemini"
  | "pi-http";

export interface ConvertedRequest {
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface NormalizedUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  reasoningTokens: number | null;
  completeness: "complete" | "partial" | "unavailable";
}

export interface ProtocolAdapter {
  convertRequest(
    body: Record<string, unknown>,
    target: ProtocolFormat,
  ): ConvertedRequest;
  normalizeUsage(body: unknown): NormalizedUsage;
}

export function convertProtocolRequest(
  source: ProtocolFormat,
  target: ProtocolFormat,
  body: Record<string, unknown>,
): ConvertedRequest {
  if (source === target) {
    return {
      path: pathFor(target),
      body,
      headers: contentHeaders(target),
    };
  }
  const chat = toChat(source, body);
  return {
    path: pathFor(target),
    body: fromChat(target, chat),
    headers: contentHeaders(target),
  };
}

export function normalizeUsage(body: unknown): NormalizedUsage {
  const record = asRecord(body);
  const usage =
    asRecord(record?.usage) ??
    asRecord(record?.usageMetadata) ??
    asRecord(record?.response)?.usage;
  const value = asRecord(usage);
  if (!value) {
    return {
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      reasoningTokens: null,
      completeness: "unavailable",
    };
  }
  const inputTokens = numberField(value, [
    "input_tokens",
    "prompt_tokens",
    "promptTokenCount",
  ]);
  const outputTokens = numberField(value, [
    "output_tokens",
    "completion_tokens",
    "candidatesTokenCount",
  ]);
  const cacheReadTokens = numberField(value, [
    "cache_read_input_tokens",
    "cached_tokens",
    "cachedContentTokenCount",
  ]);
  const reasoningTokens = numberField(value, [
    "reasoning_tokens",
    "thoughtsTokenCount",
  ]);
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    reasoningTokens,
    completeness:
      inputTokens !== null && outputTokens !== null ? "complete" : "partial",
  };
}

interface ChatShape {
  model: string;
  messages: Array<Record<string, unknown>>;
  stream: boolean;
  tools?: unknown;
}

function toChat(
  source: ProtocolFormat,
  body: Record<string, unknown>,
): ChatShape {
  if (source === "openai-chat" || source === "pi-http") {
    return {
      model: String(body.model ?? ""),
      messages: recordArray(body.messages),
      stream: body.stream === true,
      tools: body.tools,
    };
  }
  if (source === "openai-responses") {
    return {
      model: String(body.model ?? ""),
      messages: inputToMessages(body.input),
      stream: body.stream === true,
      tools: body.tools,
    };
  }
  if (source === "anthropic-messages") {
    const messages = recordArray(body.messages);
    const system = body.system;
    return {
      model: String(body.model ?? ""),
      messages:
        system === undefined
          ? messages
          : [{ role: "system", content: system }, ...messages],
      stream: body.stream === true,
      tools: body.tools,
    };
  }
  return {
    model: String(body.model ?? ""),
    messages: geminiContentsToMessages(body.contents),
    stream: body.stream === true,
    tools: body.tools,
  };
}

function fromChat(
  target: ProtocolFormat,
  chat: ChatShape,
): Record<string, unknown> {
  if (target === "openai-chat" || target === "pi-http") {
    return {
      model: chat.model,
      messages: chat.messages,
      stream: chat.stream,
      ...(chat.tools === undefined ? {} : { tools: chat.tools }),
    };
  }
  if (target === "openai-responses") {
    return {
      model: chat.model,
      input: chat.messages,
      stream: chat.stream,
      ...(chat.tools === undefined ? {} : { tools: chat.tools }),
    };
  }
  if (target === "anthropic-messages") {
    const system = chat.messages.filter((message) => message.role === "system");
    const messages = chat.messages.filter((message) => message.role !== "system");
    return {
      model: chat.model,
      max_tokens: 4096,
      messages,
      stream: chat.stream,
      ...(system.length === 0
        ? {}
        : { system: system.map((message) => message.content).join("\n") }),
      ...(chat.tools === undefined ? {} : { tools: chat.tools }),
    };
  }
  return {
    model: chat.model,
    contents: chat.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: contentText(message.content) }],
      })),
    stream: chat.stream,
  };
}

function pathFor(format: ProtocolFormat): string {
  switch (format) {
    case "openai-chat":
      return "/v1/chat/completions";
    case "openai-responses":
      return "/v1/responses";
    case "anthropic-messages":
      return "/v1/messages";
    case "gemini":
      return "/v1beta/models:generateContent";
    case "pi-http":
      return "/v1/chat/completions";
  }
}

function contentHeaders(format: ProtocolFormat): Record<string, string> {
  return format === "anthropic-messages"
    ? {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      }
    : { "content-type": "application/json" };
}

function inputToMessages(value: unknown): Array<Record<string, unknown>> {
  if (typeof value === "string") {
    return [{ role: "user", content: value }];
  }
  return recordArray(value);
}

function geminiContentsToMessages(value: unknown): Array<Record<string, unknown>> {
  return recordArray(value).map((content) => ({
    role: content.role === "model" ? "assistant" : "user",
    content: recordArray(content.parts)
      .map((part) => String(part.text ?? ""))
      .join(""),
  }));
}

function contentText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const record = asRecord(item);
        return typeof record?.text === "string" ? record.text : "";
      })
      .join("");
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = asRecord(item);
        return record ? [record] : [];
      })
    : [];
}

function numberField(
  value: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    if (typeof value[key] === "number") {
      return value[key];
    }
  }
  return null;
}
