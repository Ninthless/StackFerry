import { randomUUID } from "node:crypto";
import type { NormalizedUsage, ProtocolFormat } from "./protocols";
import { normalizeUsage } from "./protocols";

export interface RouteTarget {
  id: string;
  url: string;
  format: ProtocolFormat;
  headers: Record<string, string>;
}

export interface RouteRequest {
  sourceFormat: ProtocolFormat;
  body: Record<string, unknown>;
  stream: boolean;
  replayable: boolean;
  targets: RouteTarget[];
}

export interface RouteAttempt {
  targetId: string;
  startedAt: string;
  completedAt: string;
  status: "success" | "failed" | "skipped";
  statusCode: number | null;
  failureKind: string | null;
}

export interface RequestLog {
  requestId: string;
  requestModel: string;
  finalModel: string;
  finalTargetId: string | null;
  durationMs: number;
  ttftMs: number | null;
  statusCode: number;
  errorMessage: string | null;
  attempts: RouteAttempt[];
  usage: NormalizedUsage;
  thinkingSource: string | null;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private readonly threshold = 4,
    private readonly resetAfterMs = 60_000,
  ) {}

  canAttempt(now = Date.now()): boolean {
    if (this.state !== "open") {
      return true;
    }
    if (now - this.openedAt >= this.resetAfterMs) {
      this.state = "half-open";
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = now;
    }
  }

  snapshot(): { state: string; failures: number } {
    return { state: this.state, failures: this.failures };
  }
}

export interface AttemptResult {
  statusCode: number;
  body: unknown;
  durationMs: number;
  ttftMs: number | null;
  retryable: boolean;
}

export class RouteExecutor {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly executeAttempt: (
      target: RouteTarget,
      request: RouteRequest,
    ) => Promise<AttemptResult>,
  ) {}

  async execute(request: RouteRequest): Promise<RequestLog> {
    const requestId = randomUUID();
    const startedAt = performance.now();
    const attempts: RouteAttempt[] = [];
    let finalTargetId: string | null = null;
    let finalResult: AttemptResult | null = null;
    let errorMessage: string | null = null;
    for (const target of request.targets) {
      const breaker = this.breakers.get(target.id) ?? new CircuitBreaker();
      this.breakers.set(target.id, breaker);
      if (!breaker.canAttempt()) {
        const now = new Date().toISOString();
        attempts.push({
          targetId: target.id,
          startedAt: now,
          completedAt: now,
          status: "skipped",
          statusCode: null,
          failureKind: "circuit-open",
        });
        continue;
      }
      const attemptStartedAt = new Date().toISOString();
      try {
        const result = await this.executeAttempt(target, request);
        finalTargetId = target.id;
        if (result.statusCode >= 200 && result.statusCode < 400) {
          breaker.recordSuccess();
          finalResult = result;
          attempts.push({
            targetId: target.id,
            startedAt: attemptStartedAt,
            completedAt: new Date().toISOString(),
            status: "success",
            statusCode: result.statusCode,
            failureKind: null,
          });
          break;
        }
        breaker.recordFailure();
        attempts.push({
          targetId: target.id,
          startedAt: attemptStartedAt,
          completedAt: new Date().toISOString(),
          status: "failed",
          statusCode: result.statusCode,
          failureKind: "upstream-status",
        });
        errorMessage = `Upstream returned ${result.statusCode}`;
        if (!result.retryable || !request.replayable) {
          finalResult = result;
          break;
        }
      } catch (error) {
        breaker.recordFailure();
        attempts.push({
          targetId: target.id,
          startedAt: attemptStartedAt,
          completedAt: new Date().toISOString(),
          status: "failed",
          statusCode: null,
          failureKind: "network",
        });
        errorMessage = error instanceof Error ? error.message : String(error);
        if (!request.replayable) {
          break;
        }
      }
    }
    return {
      requestId,
      requestModel: String(request.body.model ?? ""),
      finalModel: String(request.body.model ?? ""),
      finalTargetId,
      durationMs: performance.now() - startedAt,
      ttftMs: finalResult?.ttftMs ?? null,
      statusCode: finalResult?.statusCode ?? 502,
      errorMessage,
      attempts,
      usage: {
        ...normalizeUsage(
          asAttemptBody(finalResult?.body)?.value ?? finalResult?.body,
        ),
      },
      thinkingSource: null,
    };
  }
}

function asAttemptBody(
  value: unknown,
): { value?: unknown; usage?: NormalizedUsage } | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as { value?: unknown; usage?: NormalizedUsage })
    : null;
}
