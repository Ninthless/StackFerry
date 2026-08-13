import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type ServerResponse,
} from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { RouteExecutor } from "../src/proxy/routing";
import { executeUndiciAttempt } from "../src/proxy/undiciAttempt";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

describe("routing integration", () => {
  it("converts, fails over, and records the final upstream semantics", async () => {
    const first = await startServer((_req, res) => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end('{"error":"unavailable"}');
    });
    const second = await startServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          messages: unknown[];
        };
        expect(req.url).toBe("/v1/messages");
        expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          '{"id":"msg_1","usage":{"input_tokens":5,"output_tokens":2}}',
        );
      });
    });
    const executor = new RouteExecutor(executeUndiciAttempt);
    const log = await executor.execute({
      sourceFormat: "openai-responses",
      body: {
        model: "gpt-5.6",
        input: [{ role: "user", content: "Hello" }],
      },
      stream: false,
      replayable: true,
      targets: [
        {
          id: "primary",
          url: first,
          format: "openai-chat",
          headers: {},
        },
        {
          id: "secondary",
          url: second,
          format: "anthropic-messages",
          headers: {},
        },
      ],
    });

    expect(log.finalTargetId).toBe("secondary");
    expect(log.statusCode).toBe(200);
    expect(log.attempts.map((attempt) => attempt.status)).toEqual([
      "failed",
      "success",
    ]);
    expect(log.usage).toMatchObject({
      inputTokens: 5,
      outputTokens: 2,
      completeness: "complete",
    });
    expect(log.ttftMs).not.toBeNull();
  });
});

async function startServer(
  handler: RequestListener<typeof IncomingMessage, typeof ServerResponse>,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || !address) {
    throw new Error("Test server did not bind");
  }
  return `http://127.0.0.1:${address.port}`;
}
