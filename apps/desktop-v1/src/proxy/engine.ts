import { request } from "undici";
import {
  proxyProtocolVersion,
  type ProxyEvent,
  type ProxyRequest,
} from "../shared/proxy";

export class ProxyEngine {
  private readonly controllers = new Map<string, AbortController>();

  async execute(
    requestMessage: ProxyRequest,
    emit: (event: ProxyEvent) => void,
  ): Promise<void> {
    if (requestMessage.method !== "execute" || !requestMessage.input) {
      throw new Error("Proxy execute request requires input");
    }
    const startedAt = performance.now();
    const controller = new AbortController();
    this.controllers.set(requestMessage.id, controller);
    let firstByteAt: number | null = null;
    let sequence = 0;
    const timeout = setTimeout(
      () => controller.abort(new Error("Proxy request timed out")),
      requestMessage.input.timeoutMs,
    );
    try {
      await injectFault(requestMessage.input.fault, controller.signal);
      const response = await request(requestMessage.input.url, {
        method: "POST",
        headers: requestMessage.input.headers,
        body: JSON.stringify(requestMessage.input.body),
        signal: controller.signal,
        headersTimeout: requestMessage.input.timeoutMs,
        bodyTimeout: requestMessage.input.timeoutMs,
      });
      emit({
        version: proxyProtocolVersion,
        id: requestMessage.id,
        type: "headers",
        status: response.statusCode,
        headers: normalizeHeaders(response.headers),
      });
      for await (const chunk of response.body) {
        if (requestMessage.input.fault === "disconnect") {
          controller.abort(new Error("Injected disconnect"));
        }
        if (firstByteAt === null) {
          firstByteAt = performance.now();
        }
        emit({
          version: proxyProtocolVersion,
          id: requestMessage.id,
          type: "data",
          sequence,
          data:
            requestMessage.input.fault === "malformed-chunk"
              ? "\u0000invalid"
              : Buffer.from(chunk).toString("utf8"),
        });
        sequence += 1;
        if (requestMessage.input.fault === "slow-consumer") {
          await delay(20, controller.signal);
        }
      }
      emit({
        version: proxyProtocolVersion,
        id: requestMessage.id,
        type: "complete",
        durationMs: performance.now() - startedAt,
        ttftMs: firstByteAt === null ? null : firstByteAt - startedAt,
      });
    } catch (error) {
      const aborted = controller.signal.aborted;
      emit({
        version: proxyProtocolVersion,
        id: requestMessage.id,
        type: "error",
        code: aborted
          ? errorMessage(error).includes("timed out")
            ? "timeout"
            : "cancelled"
          : "upstream",
        message: errorMessage(error),
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(requestMessage.id);
    }
  }

  cancel(id: string): void {
    this.controllers.get(id)?.abort(new Error("Proxy request cancelled"));
  }

  shutdown(): void {
    for (const controller of this.controllers.values()) {
      controller.abort(new Error("Proxy process shutting down"));
    }
    this.controllers.clear();
  }
}

async function injectFault(
  fault: NonNullable<ProxyRequest["input"]>["fault"],
  signal: AbortSignal,
): Promise<void> {
  if (fault === "timeout") {
    await delay(60_000, signal);
  }
}

function delay(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, durationMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) =>
      value === undefined
        ? []
        : [[key, Array.isArray(value) ? value.join(", ") : value]],
    ),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
