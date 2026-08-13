import { z } from "zod";

export const appErrorCodeSchema = z.enum([
  "invalid-request",
  "forbidden",
  "not-found",
  "conflict",
  "unsupported",
  "unavailable",
  "io",
  "invalid-config",
  "internal",
]);

export const appErrorSchema = z.object({
  code: appErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type AppErrorCode = z.infer<typeof appErrorCodeSchema>;
export type AppErrorData = z.infer<typeof appErrorSchema>;

export class DesktopApiError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(error: AppErrorData) {
    super(error.message);
    this.name = "DesktopApiError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.details = error.details;
  }
}

export function toAppError(error: unknown): AppErrorData {
  if (error instanceof DesktopApiError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return {
      code: "internal",
      message: error.message,
      retryable: false,
    };
  }
  return {
    code: "internal",
    message: "Unexpected desktop error",
    retryable: false,
  };
}

export function ipcResultSchema<T extends z.ZodType>(
  dataSchema: T,
): z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      ok: z.ZodLiteral<true>;
      data: T;
    }>,
    z.ZodObject<{
      ok: z.ZodLiteral<false>;
      error: typeof appErrorSchema;
    }>,
  ],
  "ok"
> {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({ ok: z.literal(false), error: appErrorSchema }),
  ]);
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppErrorData };
