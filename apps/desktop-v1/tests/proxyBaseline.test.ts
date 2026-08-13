import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProxyEngine } from "../src/proxy/engine";
import { SseParser } from "../src/proxy/streamParser";
import type { ProxyEvent } from "../src/shared/proxy";

describe("proxy baseline", () => {
  it("captures headers, streamed data, completion, and ttft", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      setTimeout(() => res.write("data: hello\n\n"), 10);
      setTimeout(() => {
        res.write("data: world\n\n");
        res.end();
      }, 20);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const url =
      typeof address === "object" && address
        ? `http://127.0.0.1:${address.port}`
        : "";
    const engine = new ProxyEngine();
    const events: ProxyEvent[] = [];

    await engine.execute(
      {
        version: 1,
        id: randomUUID(),
        method: "execute",
        input: {
          format: "openai-chat",
          url,
          headers: { "content-type": "application/json" },
          body: { model: "gpt-5.6", stream: true },
          stream: true,
          timeoutMs: 1000,
          fault: "none",
        },
      },
      (event) => events.push(event),
    );
    server.close();

    expect(events[0].type).toBe("headers");
    const parser = new SseParser();
    const payload = events
      .filter((event): event is Extract<ProxyEvent, { type: "data" }> => event.type === "data")
      .flatMap((event) => parser.push(event.data))
      .concat(parser.finish());
    expect(payload.map((event) => event.data)).toEqual(["hello", "world"]);
    const complete = events.at(-1);
    expect(complete?.type).toBe("complete");
    if (complete?.type === "complete") {
      expect(complete.ttftMs).not.toBeNull();
      expect(complete.durationMs).toBeGreaterThanOrEqual(complete.ttftMs ?? 0);
    }
  });

  it("injects timeout and malformed chunk faults", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const url =
      typeof address === "object" && address
        ? `http://127.0.0.1:${address.port}`
        : "";
    const engine = new ProxyEngine();

    const timeoutEvents: ProxyEvent[] = [];
    await engine.execute(
      {
        version: 1,
        id: randomUUID(),
        method: "execute",
        input: {
          format: "openai-chat",
          url,
          headers: {},
          body: {},
          stream: false,
          timeoutMs: 30,
          fault: "timeout",
        },
      },
      (event) => timeoutEvents.push(event),
    );
    expect(timeoutEvents.at(-1)).toMatchObject({
      type: "error",
      code: "timeout",
    });

    const malformedEvents: ProxyEvent[] = [];
    await engine.execute(
      {
        version: 1,
        id: randomUUID(),
        method: "execute",
        input: {
          format: "openai-chat",
          url,
          headers: {},
          body: {},
          stream: true,
          timeoutMs: 500,
          fault: "malformed-chunk",
        },
      },
      (event) => malformedEvents.push(event),
    );
    expect(
      malformedEvents.some(
        (event) => event.type === "data" && event.data === "\u0000invalid",
      ),
    ).toBe(true);
    server.close();
  });
});
