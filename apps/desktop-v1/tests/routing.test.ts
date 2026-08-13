import { describe, expect, it } from "vitest";
import {
  convertProtocolRequest,
  normalizeUsage,
} from "../src/proxy/protocols";
import { CircuitBreaker, RouteExecutor } from "../src/proxy/routing";
import { validateListenPolicy } from "../src/proxy/security";

describe("protocol migration", () => {
  it("converts OpenAI Responses to Claude Messages and Gemini", () => {
    const source = {
      model: "gpt-5.6",
      input: [
        { role: "system", content: "Be precise" },
        { role: "user", content: "Hello" },
      ],
      stream: true,
    };
    const claude = convertProtocolRequest(
      "openai-responses",
      "anthropic-messages",
      source,
    );
    expect(claude.path).toBe("/v1/messages");
    expect(claude.body).toMatchObject({
      model: "gpt-5.6",
      system: "Be precise",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    });

    const gemini = convertProtocolRequest(
      "openai-responses",
      "gemini",
      source,
    );
    expect(gemini.body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
    });
  });

  it("normalizes token usage without inventing missing values", () => {
    expect(
      normalizeUsage({
        usage: {
          input_tokens: 12,
          output_tokens: 4,
          cache_read_input_tokens: 3,
        },
      }),
    ).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      cacheReadTokens: 3,
      reasoningTokens: null,
      completeness: "complete",
    });
    expect(normalizeUsage({})).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      completeness: "unavailable",
    });
  });

  it("fails over replayable requests and stops non-replayable requests", async () => {
    const attempts: string[] = [];
    const executor = new RouteExecutor(async (target) => {
      attempts.push(target.id);
      return target.id === "first"
        ? {
            statusCode: 503,
            body: {},
            durationMs: 3,
            ttftMs: null,
            retryable: true,
          }
        : {
            statusCode: 200,
            body: {},
            durationMs: 4,
            ttftMs: 2,
            retryable: false,
          };
    });
    const base = {
      sourceFormat: "openai-chat" as const,
      body: { model: "gpt-5.6" },
      stream: false,
      targets: [
        { id: "first", url: "https://first", format: "openai-chat" as const, headers: {} },
        { id: "second", url: "https://second", format: "openai-chat" as const, headers: {} },
      ],
    };

    const replayable = await executor.execute({ ...base, replayable: true });
    expect(attempts).toEqual(["first", "second"]);
    expect(replayable.finalTargetId).toBe("second");
    expect(replayable.ttftMs).toBe(2);

    attempts.length = 0;
    const nonReplayable = await executor.execute({
      ...base,
      replayable: false,
    });
    expect(attempts).toEqual(["first"]);
    expect(nonReplayable.finalTargetId).toBe("first");
  });

  it("opens and recovers a circuit after the reset window", () => {
    const breaker = new CircuitBreaker(2, 100);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    expect(breaker.canAttempt(50)).toBe(false);
    expect(breaker.canAttempt(101)).toBe(true);
    breaker.recordSuccess();
    expect(breaker.snapshot()).toEqual({ state: "closed", failures: 0 });
  });

  it("binds externally only with confirmation and authentication", () => {
    expect(() => validateListenPolicy({ host: "127.0.0.1" })).not.toThrow();
    expect(() => validateListenPolicy({ host: "::1" })).not.toThrow();
    expect(() => validateListenPolicy({ host: "0.0.0.0" })).toThrow(
      "explicit confirmation",
    );
    expect(() =>
      validateListenPolicy({
        host: "0.0.0.0",
        confirmedExternalAccess: true,
        authenticationToken: "short",
      }),
    ).toThrow("strong local token");
    expect(() =>
      validateListenPolicy({
        host: "0.0.0.0",
        confirmedExternalAccess: true,
        authenticationToken: "a".repeat(32),
      }),
    ).not.toThrow();
  });
});
