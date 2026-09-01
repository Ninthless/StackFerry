import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManagerPage } from "@/features/sessions/SessionManagerPage";
import { sessionsApi } from "@/platform/tauri/api/sessions";
import { providersApi } from "@/platform/tauri/api/providers";
import type { SessionMessage, SessionMeta } from "@/shared/contracts";
import { setSessionFixtures } from "../msw/state";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const GROUP_EXPANSION_STORAGE_KEY =
  "stackferry.sessionManager.groupExpansionState";
const PROVIDER_STORAGE_KEY = "stackferry.sessions.providerFilter";
const SCOPE_STORAGE_KEY = "stackferry.sessions.scopeFilter";

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/features/sessions/SessionToc", () => ({
  SessionTocSidebar: () => null,
  SessionTocDialog: () => null,
}));

vi.mock("@/shared/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <div>{title}</div>
        <div>{message}</div>
        <button onClick={onConfirm}>{confirmText}</button>
        <button onClick={onCancel}>{cancelText}</button>
      </div>
    ) : null,
}));

const renderPage = (sessionProvider: string | null = "codex") => {
  if (sessionProvider !== null) {
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, sessionProvider);
  }
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <SessionManagerPage />
      </QueryClientProvider>,
    ),
  };
};

const openSearch = () => {
  return screen.getByRole("textbox", { name: /搜索会话元数据/i });
};

const closeSearch = () => {
  fireEvent.click(screen.getByRole("button", { name: /清除/i }));
};

const openViewModeMenu = async () => {
  await userEvent.click(screen.getByRole("combobox", { name: /查看方式/i }));
};

const switchToGroupedView = async () => {
  await openViewModeMenu();
  const groupedOption = await screen.findByRole("option", {
    name: /按项目/i,
  });
  await userEvent.click(groupedOption);
  await waitFor(() =>
    expect(
      screen.queryByRole("option", { name: /按项目/i }),
    ).not.toBeInTheDocument(),
  );
};

const switchSessionProvider = async (providerLabel: RegExp) => {
  const providerTrigger = screen.getByRole("combobox", {
    name: /会话供应商/i,
  });

  await userEvent.click(providerTrigger);
  await userEvent.click(
    await screen.findByRole("option", { name: providerLabel }),
  );
};

const enterGroupedBatchMode = async () => {
  await switchToGroupedView();
  fireEvent.click(screen.getByRole("button", { name: /批量管理/i }));
};

const collapseAllGroups = () => {
  fireEvent.click(screen.getByRole("button", { name: /全部收起/i }));
};

const expandDirectoryGroup = (_provider: string, directory: string) => {
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(`展开或折叠 ${directory} 目录分组`),
    }),
  );
};

describe("SessionManagerPage", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
    window.localStorage.removeItem("stackferry.sessionManager.listViewMode");
    window.localStorage.removeItem(GROUP_EXPANSION_STORAGE_KEY);
    window.localStorage.removeItem(PROVIDER_STORAGE_KEY);
    window.localStorage.removeItem(SCOPE_STORAGE_KEY);

    const sessions: SessionMeta[] = [
      {
        providerId: "codex",
        sessionId: "codex-session-1",
        title: "Alpha Session",
        summary: "Alpha summary",
        projectDir: "/mock/codex",
        createdAt: 2,
        lastActiveAt: 20,
        sourcePath: "/mock/codex/session-1.jsonl",
        resumeCommand: "codex resume codex-session-1",
      },
      {
        providerId: "codex",
        sessionId: "codex-session-2",
        title: "Beta Session",
        summary: "Beta summary",
        projectDir: "/mock/codex",
        createdAt: 1,
        lastActiveAt: 10,
        sourcePath: "/mock/codex/session-2.jsonl",
        resumeCommand: "codex resume codex-session-2",
      },
      {
        providerId: "claude",
        sessionId: "claude-session-1",
        title: "Claude Session",
        summary: "Claude summary",
        projectDir: "/mock/claude",
        createdAt: 3,
        lastActiveAt: 30,
        sourcePath: "/mock/claude/session-1.jsonl",
        resumeCommand: "claude --resume claude-session-1",
      },
      {
        providerId: "codex",
        sessionId: "codex-session-3",
        title: "Gamma Session",
        summary: "Gamma summary",
        projectDir: null,
        createdAt: 0,
        lastActiveAt: 5,
        sourcePath: "/mock/codex/session-3.jsonl",
        resumeCommand: "codex resume codex-session-3",
      },
    ];
    const messages: Record<string, SessionMessage[]> = {
      "codex:/mock/codex/session-1.jsonl": [
        { role: "user", content: "alpha", ts: 20 },
      ],
      "codex:/mock/codex/session-2.jsonl": [
        { role: "user", content: "beta", ts: 10 },
      ],
      "codex:/mock/codex/session-3.jsonl": [
        { role: "user", content: "gamma", ts: 5 },
      ],
      "claude:/mock/claude/session-1.jsonl": [
        { role: "user", content: "claude", ts: 30 },
      ],
    };

    setSessionFixtures(sessions, messages);
  });

  it("keeps vertical workspace spacing around the session cards", () => {
    const { container } = renderPage();

    expect(container.firstElementChild).toHaveClass("py-4");
  });

  it("renders the stable master-detail workbench contract", () => {
    const { container } = renderPage();

    expect(screen.getByTestId("session-master-detail")).toHaveClass(
      "session-manager-layout",
    );
    expect(
      screen
        .getByTestId("session-master-detail")
        .closest('[data-layout-contract="dual-pane-from-680"]'),
    ).toBeInTheDocument();
    expect(screen.getByTestId("session-master-pane")).toBeInTheDocument();
    expect(screen.getByTestId("session-detail-pane")).toBeInTheDocument();
    expect(
      container.querySelector(".session-manager-workbench"),
    ).not.toHaveAttribute("onwheel");
    expect(screen.getByTestId("session-master-detail")).toHaveAttribute(
      "data-layout-contract",
      "responsive-master-detail",
    );
  });

  it("exposes the conversation as a polite accessible log", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByRole("log", { name: /对话记录/i })).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("keeps toolbar controls visible while filtering metadata", async () => {
    renderPage();

    const search = openSearch();
    fireEvent.change(search, { target: { value: "Alpha" } });

    expect(screen.getByRole("combobox", { name: /会话供应商/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /刷新/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /批量管理/i })).toBeVisible();
    expect(search).toHaveAttribute(
      "placeholder",
      "搜索标题、摘要、项目、路径或 ID",
    );
  });

  it("filters default and named runtime environments explicitly", async () => {
    setSessionFixtures(
      [
        {
          providerId: "codex",
          sessionId: "default-session",
          title: "Default Session",
          sourcePath: "/mock/default.jsonl",
        },
        {
          providerId: "codex",
          sessionId: "isolated-session",
          instanceId: "instance-1",
          title: "Isolated Session",
          sourcePath: "/mock/isolated.jsonl",
        },
      ],
      {},
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("Default Session").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Isolated Session").length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getByRole("combobox", { name: /运行环境/i }));
    await userEvent.click(
      await screen.findByRole("option", { name: /默认环境/i }),
    );

    await waitFor(() => {
      expect(screen.getAllByText("Default Session").length).toBeGreaterThan(0);
      expect(screen.queryByText("Isolated Session")).not.toBeInTheDocument();
    });
  });

  it("does not expose resume controls for OpenClaw sessions", async () => {
    setSessionFixtures(
      [
        {
          providerId: "openclaw",
          sessionId: "openclaw-session",
          title: "OpenClaw Session",
          sourcePath: "/mock/openclaw/state.db",
          resumeCommand: "openclaw resume openclaw-session",
        },
      ],
      { "openclaw:/mock/openclaw/state.db": [] },
    );
    renderPage("openclaw");

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "OpenClaw Session" }),
      ).toBeInTheDocument(),
    );

    expect(
      screen.queryByRole("button", { name: /恢复会话|复制命令/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("openclaw resume")).not.toBeInTheDocument();
  });

  it("launches resume commands through the terminal API on every platform", async () => {
    const launchSpy = vi
      .spyOn(sessionsApi, "launchTerminal")
      .mockResolvedValueOnce(true);
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /恢复会话/i }));

    await waitFor(() =>
      expect(launchSpy).toHaveBeenCalledWith({
        command: "codex resume codex-session-1",
        cwd: "/mock/codex",
        providerId: "codex",
        instanceId: undefined,
        sessionId: "codex-session-1",
        sourcePath: "/mock/codex/session-1.jsonl",
      }),
    );
    launchSpy.mockRestore();
  });

  it("shows environment and Provider identity for isolated sessions", async () => {
    setSessionFixtures(
      [
        {
          providerId: "codex",
          sessionId: "isolated-session",
          instanceId: "instance-1",
          title: "Isolated Session",
          projectDir: "/mock/isolated",
          sourcePath: "/mock/isolated.jsonl",
          resumeCommand: "codex resume isolated-session",
        },
      ],
      {},
    );
    const getAllSpy = vi.spyOn(providersApi, "getAll").mockResolvedValue({
      "provider-1": {
        id: "provider-1",
        name: "Acme Provider",
        settingsConfig: {},
      },
    });
    const getInstancesSpy = vi
      .spyOn(providersApi, "getAgentInstances")
      .mockResolvedValue([
        {
          id: "instance-1",
          providerId: "provider-1",
          appType: "codex",
          name: "Work Environment",
          createdAt: 1,
          updatedAt: 1,
        },
      ]);

    renderPage();

    await waitFor(() => {
      expect(getAllSpy).toHaveBeenCalledWith("codex");
      expect(getInstancesSpy).toHaveBeenCalledWith("provider-1", "codex");
    });
    await waitFor(() => {
      expect(
        screen.getByText("sessionManager.environmentIdentity"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("sessionManager.providerIdentity"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("sessionManager.bareCommandWarning"),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("combobox", { name: /运行环境/i }));
    expect(
      await screen.findByRole("option", {
        name: "Work Environment · Acme Provider",
      }),
    ).toBeInTheDocument();

    getAllSpy.mockRestore();
    getInstancesSpy.mockRestore();
  });

  it("switches compact detail state and returns to the list", async () => {
    const { container } = renderPage();

    await waitFor(() =>
      expect(screen.getByText("Alpha Session")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Alpha Session/i }));

    expect(
      container.querySelector(".session-manager-compact-detail"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /返回会话列表/i }));
    expect(
      container.querySelector(".session-manager-compact-detail"),
    ).not.toBeInTheDocument();
  });

  it("defaults a clean profile to Codex sessions", async () => {
    renderPage(null);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Claude Session")).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(PROVIDER_STORAGE_KEY)).toBe("codex");
  });

  it("restores a valid session provider after remounting", async () => {
    const firstRender = renderPage(null);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );
    await switchSessionProvider(/Claude/i);
    await waitFor(() =>
      expect(window.localStorage.getItem(PROVIDER_STORAGE_KEY)).toBe("claude"),
    );

    firstRender.unmount();
    renderPage(null);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Claude Session" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument();
    });
  });

  it.each(["all", "invalid-client"])(
    "replaces legacy or invalid provider %s with Codex",
    async (storedProvider) => {
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, storedProvider);

      renderPage(null);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Alpha Session" }),
        ).toBeInTheDocument();
        expect(window.localStorage.getItem(PROVIDER_STORAGE_KEY)).toBe("codex");
      });
    },
  );

  it("clears the selected detail when switching session provider", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await switchSessionProvider(/Claude/i);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Claude Session" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument();
    });
  });

  it("deletes the selected session and selects the next visible session", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /删除会话/i }));

    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Alpha Session/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /删除会话/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Beta Session" }),
      ).toBeInTheDocument(),
    );

    expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("passes the instance id when deleting one isolated session", async () => {
    setSessionFixtures(
      [
        {
          providerId: "codex",
          sessionId: "isolated-session",
          instanceId: "instance-1",
          title: "Isolated Session",
          sourcePath: "/mock/isolated.jsonl",
        },
      ],
      {},
    );
    const deleteSpy = vi.spyOn(sessionsApi, "delete");
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Isolated Session")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /删除会话/i }));
    fireEvent.click(
      within(screen.getByTestId("confirm-dialog")).getByRole("button", {
        name: /删除会话/i,
      }),
    );

    await waitFor(() =>
      expect(deleteSpy).toHaveBeenCalledWith({
        providerId: "codex",
        sessionId: "isolated-session",
        instanceId: "instance-1",
        sourcePath: "/mock/isolated.jsonl",
      }),
    );
    deleteSpy.mockRestore();
  });

  it("removes a deleted session from filtered search results", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    openSearch();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Alpha" },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /删除会话/i }));

    const dialog = screen.getByTestId("confirm-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /删除会话/i }));

    await waitFor(() =>
      expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument(),
    );

    expect(
      screen.getByText("sessionManager.selectSession"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("sessionManager.emptySession"),
    ).not.toBeInTheDocument();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("restores batch delete controls when deleteMany rejects", async () => {
    const deleteManySpy = vi
      .spyOn(sessionsApi, "deleteMany")
      .mockRejectedValueOnce(new Error("network error"));

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /批量管理/i }));
    fireEvent.click(screen.getByRole("button", { name: /全选当前/i }));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/i }));

    const dialog = screen.getByTestId("confirm-dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /删除所选会话/i }),
    );

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("network error"),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /批量删除/i }),
      ).not.toBeDisabled(),
    );

    deleteManySpy.mockRestore();
  });

  it("keeps failed sessions selected after a partial batch delete", async () => {
    const deleteManySpy = vi
      .spyOn(sessionsApi, "deleteMany")
      .mockResolvedValueOnce([
        {
          providerId: "codex",
          sessionId: "codex-session-1",
          sourcePath: "/mock/codex/session-1.jsonl",
          success: true,
        },
        {
          providerId: "codex",
          sessionId: "codex-session-2",
          sourcePath: "/mock/codex/session-2.jsonl",
          success: false,
          error: "locked",
        },
        {
          providerId: "codex",
          sessionId: "codex-session-3",
          sourcePath: "/mock/codex/session-3.jsonl",
          success: true,
        },
      ]);

    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Alpha Session")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /批量管理/i }));
    fireEvent.click(screen.getByRole("button", { name: /全选当前/i }));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/i }));
    fireEvent.click(
      within(screen.getByTestId("confirm-dialog")).getByRole("button", {
        name: /删除所选会话/i,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument();
      expect(screen.getByText("Beta Session")).toBeInTheDocument();
      expect(screen.getByText("已选 1 项")).toBeInTheDocument();
    });
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "1 个会话删除失败",
      expect.objectContaining({ description: "locked" }),
    );

    deleteManySpy.mockRestore();
  });

  it("keeps the exit batch mode button visible when search hides all sessions", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /批量管理/i }));
    openSearch();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "NoSuchSession" },
    });

    await waitFor(() => expect(screen.queryByText("Alpha Session")).toBeNull());

    expect(screen.getByRole("button", { name: /退出批量管理/i })).toBeVisible();
  });

  it("drops hidden selections when search narrows the result set", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /批量管理/i }));
    fireEvent.click(screen.getByRole("button", { name: /全选当前/i }));

    expect(screen.getByText("已选 3 项")).toBeInTheDocument();

    openSearch();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Alpha" },
    });

    await waitFor(() =>
      expect(screen.queryByText("Beta Session")).not.toBeInTheDocument(),
    );

    closeSearch();

    await waitFor(() =>
      expect(screen.getByText("已选 1 项")).toBeInTheDocument(),
    );
  });

  it("forces a metadata rescan from the refresh action", async () => {
    const listSpy = vi.spyOn(sessionsApi, "list");
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /刷新/i }));

    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith("codex", { type: "all" }, true),
    );
    listSpy.mockRestore();
  });

  it("mounts only a bounded viewport for a large flat session list", async () => {
    const sessions = Array.from({ length: 2000 }, (_, index) => ({
      providerId: "codex",
      sessionId: `large-${index}`,
      title: `Large Session ${index}`,
      projectDir: "/mock/large",
      createdAt: 2000 - index,
      lastActiveAt: 2000 - index,
      sourcePath: `/mock/large/${index}.jsonl`,
      resumeCommand: `codex resume large-${index}`,
    })) satisfies SessionMeta[];
    setSessionFixtures(sessions, {});
    renderPage();

    const list = await screen.findByTestId("virtualized-session-list");
    await waitFor(() =>
      expect(within(list).getAllByRole("button").length).toBeGreaterThan(0),
    );

    expect(within(list).getAllByRole("button").length).toBeLessThan(40);
    expect(list).toHaveStyle({ height: "136000px" });
    expect(
      screen.getByRole("heading", { name: "Large Session 0" }),
    ).toBeInTheDocument();
  });

  it("loads later message pages only after the first page is requested", async () => {
    const messages = Array.from({ length: 55 }, (_, index) => ({
      role: "user",
      content: `message-${index}`,
      ts: index,
    }));
    setSessionFixtures(
      [
        {
          providerId: "codex",
          sessionId: "paged-session",
          title: "Paged Session",
          sourcePath: "/mock/codex/paged.jsonl",
          lastActiveAt: 1,
        },
      ],
      { "codex:/mock/codex/paged.jsonl": messages },
    );
    const pageSpy = vi.spyOn(sessionsApi, "getMessagePage");

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("loaded-message-count")).toHaveTextContent(
        "50",
      ),
    );
    expect(pageSpy).toHaveBeenCalledWith(
      "codex",
      "/mock/codex/paged.jsonl",
      undefined,
      undefined,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /加载更多消息/i }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("loaded-message-count")).toHaveTextContent(
        "55",
      ),
    );
    expect(pageSpy).toHaveBeenCalledWith(
      "codex",
      "/mock/codex/paged.jsonl",
      "index:50",
      undefined,
    );
    pageSpy.mockRestore();
  });

  it("loads full message content on expansion and copy", async () => {
    const fullContent = "full message content ".repeat(250);
    const pageSpy = vi
      .spyOn(sessionsApi, "getMessagePage")
      .mockResolvedValueOnce({
        items: [
          {
            role: "assistant",
            content: "preview message",
            contentCursor: "fixture:0",
            contentBytes: fullContent.length,
          },
        ],
        hasMore: false,
      });
    const contentSpy = vi
      .spyOn(sessionsApi, "getMessageContent")
      .mockResolvedValue(fullContent);
    const copySpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copySpy },
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/preview message/)).toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /展开完整内容/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/full message content/)).toBeInTheDocument(),
    );
    expect(contentSpy).toHaveBeenCalledWith(
      "codex",
      "/mock/codex/session-1.jsonl",
      "fixture:0",
    );

    await userEvent.click(screen.getByRole("button", { name: /复制消息/i }));
    await waitFor(() => expect(copySpy).toHaveBeenCalledWith(fullContent));
    expect(contentSpy).toHaveBeenCalledTimes(1);

    pageSpy.mockRestore();
    contentSpy.mockRestore();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("does not render a stale page after switching session providers", async () => {
    let resolveCodex!: (page: {
      items: SessionMessage[];
      hasMore: boolean;
    }) => void;
    const pageSpy = vi
      .spyOn(sessionsApi, "getMessagePage")
      .mockImplementation(async (providerId) => {
        if (providerId === "codex") {
          return await new Promise((resolve) => {
            resolveCodex = resolve;
          });
        }
        return {
          items: [{ role: "assistant", content: "claude-current" }],
          hasMore: false,
        };
      });

    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await switchSessionProvider(/Claude/i);
    await waitFor(() =>
      expect(screen.getByText("claude-current")).toBeInTheDocument(),
    );

    resolveCodex({
      items: [{ role: "assistant", content: "codex-stale" }],
      hasMore: false,
    });
    await waitFor(() =>
      expect(screen.queryByText("codex-stale")).not.toBeInTheDocument(),
    );
    pageSpy.mockRestore();
  });

  it("removes successfully deleted sessions from the UI before refetch completes", async () => {
    const view = renderPage();
    let resolveInvalidate!: () => void;
    const invalidateSpy = vi
      .spyOn(view.client, "invalidateQueries")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveInvalidate = () => resolve(undefined);
          }),
      );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /批量管理/i }));
    fireEvent.click(screen.getByRole("button", { name: /全选当前/i }));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/i }));

    const dialog = screen.getByTestId("confirm-dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /删除所选会话/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument();
      expect(screen.queryByText("Beta Session")).not.toBeInTheDocument();
    });

    await act(async () => {
      resolveInvalidate();
    });
    invalidateSpy.mockRestore();
  });

  it("switches to grouped view collapsed by default and shows collapse control", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await switchToGroupedView();

    expect(
      screen.getByRole("button", { name: /全部收起/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /供应商分组/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /展开或折叠 codex 目录分组/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Alpha Session/ }),
    ).not.toBeInTheDocument();
  });

  it("persists manual expansion and collapses all grouped sessions", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await switchToGroupedView();
    expandDirectoryGroup("codex", "codex");

    expect(
      screen.getByRole("button", { name: /展开或折叠 codex 目录分组/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Alpha Session/ }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem(GROUP_EXPANSION_STORAGE_KEY)!),
      ).toEqual({
        expandedProviderIds: ["codex"],
        expandedDirectoryKeys: ["codex:/mock/codex"],
      }),
    );

    collapseAllGroups();

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Alpha Session/ }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem(GROUP_EXPANSION_STORAGE_KEY)!),
      ).toEqual({
        expandedProviderIds: ["codex"],
        expandedDirectoryKeys: [],
      }),
    );
  });

  it("keeps switched provider groups collapsed until expanding the group", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Alpha Session")).toBeInTheDocument(),
    );

    await switchToGroupedView();
    await switchSessionProvider(/Claude/i);

    await waitFor(() =>
      expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument(),
    );

    expect(
      screen.getByRole("heading", { name: "Claude Session" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /展开或折叠 claude 目录分组/ }),
    ).toBeInTheDocument();

    expandDirectoryGroup("claude", "claude");

    expect(
      screen.getByRole("button", { name: /展开或折叠 claude 目录分组/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Claude Session/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Gamma Session")).not.toBeInTheDocument();
  });

  it("supports batch deletion from grouped view", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await switchToGroupedView();
    fireEvent.click(screen.getByRole("button", { name: /批量管理/i }));
    fireEvent.click(screen.getByRole("button", { name: /全选当前/i }));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/i }));

    const dialog = screen.getByTestId("confirm-dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /删除所选会话/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument();
      expect(screen.queryByText("Beta Session")).not.toBeInTheDocument();
      expect(screen.queryByText("Gamma Session")).not.toBeInTheDocument();
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("selects visible deletable sessions by provider group in grouped batch mode", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await enterGroupedBatchMode();

    fireEvent.click(screen.getByRole("button", { name: /全选当前/i }));

    expect(
      screen.queryByRole("checkbox", {
        name: /选择 claude 供应商分组内会话/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("已选 3 项")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /取消全选/i }));
    expect(screen.getByText("已选 0 项")).toBeInTheDocument();
  });

  it("selects visible deletable sessions by directory group and marks the provider as mixed", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await enterGroupedBatchMode();
    expandDirectoryGroup("codex", "codex");

    const codexDirectoryCheckbox = screen.getByRole("checkbox", {
      name: /选择 codex 目录分组内会话/,
    });

    fireEvent.click(codexDirectoryCheckbox);

    expect(codexDirectoryCheckbox).toBeChecked();
    expect(screen.getByText("已选 2 项")).toBeInTheDocument();
  });

  it("marks grouped batch checkboxes as mixed when only one session is selected", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await enterGroupedBatchMode();
    expandDirectoryGroup("codex", "codex");

    fireEvent.click(screen.getAllByRole("checkbox", { name: "选择会话" })[0]);

    expect(
      screen.getByRole("checkbox", { name: /选择 codex 目录分组内会话/ }),
    ).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getByText("已选 1 项")).toBeInTheDocument();
  });

  it("batch deletes only sessions selected from a grouped directory", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Session" }),
      ).toBeInTheDocument(),
    );

    await enterGroupedBatchMode();
    expandDirectoryGroup("codex", "codex");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /选择 codex 目录分组内会话/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /批量删除/i }));

    const dialog = screen.getByTestId("confirm-dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /删除所选会话/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Alpha Session")).not.toBeInTheDocument();
      expect(screen.queryByText("Beta Session")).not.toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /展开或折叠 未知目录 目录分组/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "选择会话" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /展开或折叠 未知目录 目录分组/ }),
    );
    expect(
      screen.getByRole("checkbox", { name: "选择会话" }),
    ).toBeInTheDocument();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});
