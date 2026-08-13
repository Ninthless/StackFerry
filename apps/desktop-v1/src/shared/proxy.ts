import { z } from "zod";

export const proxyProtocolVersion = 1;
export const proxyFormatSchema = z.enum([
  "openai-chat",
  "openai-responses",
  "anthropic-messages",
  "gemini",
  "pi-http",
  "websocket",
]);

export const proxyRequestSchema = z.object({
  version: z.literal(proxyProtocolVersion),
  id: z.string().uuid(),
  method: z.enum(["execute", "cancel", "shutdown"]),
  input: z
    .object({
      format: proxyFormatSchema,
      url: z.string().url(),
      headers: z.record(z.string(), z.string()),
      body: z.unknown(),
      stream: z.boolean(),
      timeoutMs: z.number().int().positive(),
      fault: z
        .enum(["none", "timeout", "disconnect", "malformed-chunk", "slow-consumer"])
        .default("none"),
    })
    .optional(),
  targetId: z.string().uuid().optional(),
});

export const proxyEventSchema = z.discriminatedUnion("type", [
  z.object({
    version: z.literal(proxyProtocolVersion),
    id: z.string().uuid(),
    type: z.literal("headers"),
    status: z.number().int(),
    headers: z.record(z.string(), z.string()),
  }),
  z.object({
    version: z.literal(proxyProtocolVersion),
    id: z.string().uuid(),
    type: z.literal("data"),
    sequence: z.number().int().nonnegative(),
    data: z.string(),
  }),
  z.object({
    version: z.literal(proxyProtocolVersion),
    id: z.string().uuid(),
    type: z.literal("complete"),
    durationMs: z.number().nonnegative(),
    ttftMs: z.number().nonnegative().nullable(),
  }),
  z.object({
    version: z.literal(proxyProtocolVersion),
    id: z.string().uuid(),
    type: z.literal("error"),
    code: z.enum(["timeout", "cancelled", "upstream", "protocol", "internal"]),
    message: z.string(),
    retryable: z.boolean(),
  }),
]);

export type ProxyRequest = z.infer<typeof proxyRequestSchema>;
export type ProxyEvent = z.infer<typeof proxyEventSchema>;
