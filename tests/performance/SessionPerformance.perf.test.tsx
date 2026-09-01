import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { Profiler } from "react";
import { describe, expect, it, vi } from "vitest";

import { SessionManagerPage } from "@/features/sessions/SessionManagerPage";
import { sessionsApi } from "@/platform/tauri/api/sessions";
import type { SessionMessage, SessionMeta } from "@/shared/contracts";
import { setSessionFixtures } from "../msw/state";

const SESSION_COUNT_PER_PROVIDER = 1_000;
const PROVIDERS = ["codex", "claude", "pi"] as const;
const FIRST_SOURCE_PATH = "/benchmark/codex/session-0.jsonl";
const MESSAGE_PAGE_MAX_ITEMS = 50;
const MESSAGE_PAGE_MAX_BYTES = 512 * 1024;
const ITERATIONS = 11;

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, gcTime: 60_000 },
    },
  });

const createFixture = () => {
  const sessions: SessionMeta[] = [];
  for (const providerId of PROVIDERS) {
    for (let index = 0; index < SESSION_COUNT_PER_PROVIDER; index += 1) {
      sessions.push({
        providerId,
        sessionId: `${providerId}-session-${index}`,
        title: `${providerId} benchmark session ${index}`,
        summary: `Synthetic session ${index}`,
        projectDir: `/benchmark/${providerId}`,
        createdAt: 1_000_000 - index,
        lastActiveAt: 2_000_000 - index,
        sourcePath: `/benchmark/${providerId}/session-${index}.jsonl`,
        resumeCommand: `${providerId} resume ${providerId}-session-${index}`,
      });
    }
  }

  const messages: SessionMessage[] = Array.from({ length: 80 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `benchmark message ${index} ${"x".repeat(96)}`,
  }));

  return {
    sessions,
    messages: { [`codex:${FIRST_SOURCE_PATH}`]: messages },
  };
};

const percentile = (values: number[], percentileValue: number) => {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.ceil(ordered.length * percentileValue) - 1,
  );
  return ordered[index] ?? 0;
};

const measureAsync = async <T,>(operation: () => Promise<T>) => {
  const startedAt = performance.now();
  const value = await operation();
  return { value, durationMs: performance.now() - startedAt };
};

describe.skipIf(process.env.STACKFERRY_SESSION_PERF !== "1")(
  "session performance fixture",
  () => {
    it("meets the bounded list and preview budgets", async () => {
      const fixture = createFixture();
      setSessionFixtures(fixture.sessions, fixture.messages);
      window.localStorage.setItem(
        "stackferry.sessions.providerFilter",
        "codex",
      );

      const listSpy = vi.spyOn(sessionsApi, "list");
      const coldListDurations: number[] = [];
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const queryClient = createQueryClient();
        const measured = await measureAsync(() =>
          queryClient.fetchQuery({
            queryKey: ["sessions", "codex"],
            queryFn: () => sessionsApi.list("codex"),
          }),
        );
        coldListDurations.push(measured.durationMs);
        expect(measured.value).toHaveLength(SESSION_COUNT_PER_PROVIDER);
        queryClient.clear();
      }

      const warmQueryClient = createQueryClient();
      await warmQueryClient.fetchQuery({
        queryKey: ["sessions", "codex"],
        queryFn: () => sessionsApi.list("codex"),
      });
      const listCallsBeforeWarm = listSpy.mock.calls.length;
      const warmListDurations: number[] = [];
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const measured = await measureAsync(() =>
          warmQueryClient.fetchQuery({
            queryKey: ["sessions", "codex"],
            queryFn: () => sessionsApi.list("codex"),
          }),
        );
        warmListDurations.push(measured.durationMs);
        expect(measured.value).toHaveLength(SESSION_COUNT_PER_PROVIDER);
      }
      expect(listSpy.mock.calls.length).toBe(listCallsBeforeWarm);

      const previewDurations: number[] = [];
      let firstPageItems = 0;
      let firstPageBytes = 0;
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const queryClient = createQueryClient();
        const measured = await measureAsync(() =>
          queryClient.fetchQuery({
            queryKey: ["sessionMessages", "codex", FIRST_SOURCE_PATH],
            queryFn: () =>
              sessionsApi.getMessagePage("codex", FIRST_SOURCE_PATH),
          }),
        );
        previewDurations.push(measured.durationMs);
        firstPageItems = measured.value.items.length;
        firstPageBytes = new TextEncoder().encode(
          JSON.stringify(measured.value.items),
        ).length;
        queryClient.clear();
      }

      expect(firstPageItems).toBe(MESSAGE_PAGE_MAX_ITEMS);
      expect(firstPageBytes).toBeLessThanOrEqual(MESSAGE_PAGE_MAX_BYTES);
      expect(
        new Set(listSpy.mock.calls.map(([providerId]) => providerId)),
      ).toEqual(new Set(["codex"]));

      const renderClient = createQueryClient();
      renderClient.setQueryData(
        ["sessions", "codex"],
        fixture.sessions.filter((session) => session.providerId === "codex"),
        { updatedAt: Date.now() },
      );
      renderClient.setQueryData(
        ["sessionMessages", "codex", FIRST_SOURCE_PATH],
        {
          pages: [
            {
              items: fixture.messages[`codex:${FIRST_SOURCE_PATH}`].slice(
                0,
                MESSAGE_PAGE_MAX_ITEMS,
              ),
              nextCursor: "index:50",
              hasMore: true,
            },
          ],
          pageParams: [null],
        },
        { updatedAt: Date.now() },
      );
      const reactRenderDurations: number[] = [];
      const renderStartedAt = performance.now();
      const rendered = render(
        <QueryClientProvider client={renderClient}>
          <Profiler
            id="session-manager"
            onRender={(_id, _phase, actualDuration) =>
              reactRenderDurations.push(actualDuration)
            }
          >
            <SessionManagerPage />
          </Profiler>
        </QueryClientProvider>,
      );
      const renderSyncDuration = performance.now() - renderStartedAt;
      await waitFor(() =>
        expect(screen.getByTestId("loaded-message-count")).toHaveTextContent(
          String(MESSAGE_PAGE_MAX_ITEMS),
        ),
      );
      const mountedRows = document.querySelectorAll(
        '[data-testid="virtualized-session-list"] [data-index]',
      ).length;
      rendered.unmount();

      const metrics = {
        sessions: fixture.sessions.length,
        selectedProviderSessions: SESSION_COUNT_PER_PROVIDER,
        coldListP95Ms: percentile(coldListDurations, 0.95),
        warmListP95Ms: percentile(warmListDurations, 0.95),
        firstPreviewP95Ms: percentile(previewDurations, 0.95),
        firstPageItems,
        firstPageBytes,
        mountedRows,
        maxReactRenderDurationMs: Math.max(...reactRenderDurations),
        renderHarnessWallClockMs: renderSyncDuration,
      };
      console.log("SESSION_PERFORMANCE_METRICS", JSON.stringify(metrics));

      expect(metrics.coldListP95Ms).toBeLessThanOrEqual(2_000);
      expect(metrics.warmListP95Ms).toBeLessThanOrEqual(250);
      expect(metrics.firstPreviewP95Ms).toBeLessThanOrEqual(500);
      expect(metrics.mountedRows).toBeGreaterThan(0);
      expect(metrics.mountedRows).toBeLessThan(100);
      expect(metrics.maxReactRenderDurationMs).toBeLessThanOrEqual(100);
    });
  },
);
