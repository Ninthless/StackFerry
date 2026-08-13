import { request } from "undici";
import { convertProtocolRequest, normalizeUsage } from "./protocols";
import type {
  AttemptResult,
  RouteRequest,
  RouteTarget,
} from "./routing";

export async function executeUndiciAttempt(
  target: RouteTarget,
  route: RouteRequest,
): Promise<AttemptResult> {
  const converted = convertProtocolRequest(
    route.sourceFormat,
    target.format,
    route.body,
  );
  const startedAt = performance.now();
  let firstByteAt: number | null = null;
  const chunks: Buffer[] = [];
  const response = await request(
    new URL(converted.path, ensureTrailingSlash(target.url)),
    {
      method: "POST",
      headers: { ...target.headers, ...converted.headers },
      body: JSON.stringify(converted.body),
      headersTimeout: 60_000,
      bodyTimeout: 600_000,
    },
  );
  for await (const chunk of response.body) {
    if (firstByteAt === null) {
      firstByteAt = performance.now();
    }
    chunks.push(Buffer.from(chunk));
  }
  const bodyText = Buffer.concat(chunks).toString("utf8");
  let body: unknown = bodyText;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }
  return {
    statusCode: response.statusCode,
    body: {
      value: body,
      usage: normalizeUsage(body),
    },
    durationMs: performance.now() - startedAt,
    ttftMs: firstByteAt === null ? null : firstByteAt - startedAt,
    retryable: isRetryableStatus(response.statusCode),
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
