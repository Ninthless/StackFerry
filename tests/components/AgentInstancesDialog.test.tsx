import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@/shared/contracts";

const translations: Record<string, string> = {
  "common.close": "关闭",
  "runtimeEnvironments.title": "运行环境",
  "runtimeEnvironments.description": "运行环境",
  "runtimeEnvironments.application": "应用",
  "runtimeEnvironments.provider": "供应商",
  "runtimeEnvironments.endpoint": "请求地址",
  "runtimeEnvironments.routeAndIsolation": "路由 / 隔离",
  "runtimeEnvironments.directIsolation": "直连 · 独立凭据与数据",
  "runtimeEnvironments.createTitle": "创建运行环境",
  "runtimeEnvironments.credentialHint": "凭据提示",
  "runtimeEnvironments.sessionKeyHint":
    "同一环境内的所有会话共享当前 Key；更换 Key 会影响该环境的全部会话。",
  "runtimeEnvironments.name": "环境名称",
  "runtimeEnvironments.namePlaceholder": "环境名称",
  "runtimeEnvironments.apiKeyPlaceholder": "API Key",
  "runtimeEnvironments.showApiKey": "显示 API Key",
  "runtimeEnvironments.create": "创建",
  "runtimeEnvironments.listTitle": "已创建环境",
  "runtimeEnvironments.count": "共 0 个运行环境",
  "runtimeEnvironments.empty": "暂无运行环境",
  "runtimeEnvironments.emptyHint": "创建第一个运行环境",
  "runtimeEnvironments.status.ready": "就绪",
  "runtimeEnvironments.noRecentProject": "尚未选择项目目录",
  "runtimeEnvironments.chooseDirectory": "选择其他目录",
  "runtimeEnvironments.chooseProjectAndLaunch": "选择项目并启动 Codex CLI",
  "runtimeEnvironments.renameAria": "重命名运行环境 {{name}}",
  "runtimeEnvironments.rotateKeyAria": "更换运行环境 {{name}} 的 API Key",
  "runtimeEnvironments.deleteAria": "删除运行环境 {{name}}",
  "runtimeEnvironments.deleteTitle": "删除运行环境",
  "runtimeEnvironments.deleteWithSessionsMessage":
    "确定删除“{{name}}”吗？系统凭据、环境数据及其会话将一并清理，此操作无法撤销。",
  "runtimeEnvironments.deleteWithSessions": "删除环境和会话",
  "runtimeEnvironments.deleteSuccess": "运行环境已删除",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      (translations[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(values?.[name] ?? ""),
      ),
  }),
}));

const apiMocks = vi.hoisted(() => ({
  getAgentInstances: vi.fn(),
  createAgentInstance: vi.fn(),
  deleteAgentInstance: vi.fn(),
  openTerminal: vi.fn(),
  pickDirectory: vi.fn(),
}));

vi.mock("@/platform/tauri/api", () => ({
  settingsApi: {
    pickDirectory: apiMocks.pickDirectory,
  },
}));

vi.mock("@/platform/tauri/api/providers", () => ({
  providersApi: {
    getAgentInstances: apiMocks.getAgentInstances,
    createAgentInstance: apiMocks.createAgentInstance,
    deleteAgentInstance: apiMocks.deleteAgentInstance,
    openTerminal: apiMocks.openTerminal,
  },
}));

import { AgentInstancesDialog } from "@/features/providers/AgentInstancesDialog";

const provider: Provider = {
  id: "provider-1",
  name: "测试供应商",
  settingsConfig: {},
};

const renderDialog = (
  props: Partial<React.ComponentProps<typeof AgentInstancesDialog>> = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentInstancesDialog
        open
        appId="codex"
        provider={provider}
        onOpenChange={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
};

describe("AgentInstancesDialog", () => {
  beforeEach(() => {
    apiMocks.getAgentInstances.mockResolvedValue([]);
    apiMocks.createAgentInstance.mockResolvedValue(undefined);
    apiMocks.deleteAgentInstance.mockResolvedValue(undefined);
    apiMocks.openTerminal.mockResolvedValue(undefined);
    apiMocks.pickDirectory.mockResolvedValue("C:\\workspace");
  });

  it("提供顶部和底部关闭入口", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange });

    const closeButtons = await screen.findAllByRole("button", { name: "关闭" });
    expect(closeButtons).toHaveLength(2);
    expect(
      closeButtons.every((button) => !button.hasAttribute("disabled")),
    ).toBe(true);

    await user.click(closeButtons[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("创建实例时支持回车提交并清空凭据", async () => {
    const user = userEvent.setup();

    renderDialog();

    await screen.findByText("暂无运行环境");
    await user.type(screen.getByLabelText("环境名称"), "工作账号");
    await user.type(screen.getByLabelText("API Key"), "secret-key");
    fireEvent.submit(screen.getByText("创建运行环境").closest("form")!);

    await waitFor(() => {
      expect(apiMocks.createAgentInstance).toHaveBeenCalledWith({
        providerId: "provider-1",
        appType: "codex",
        name: "工作账号",
        apiKey: "secret-key",
      });
    });
    expect(screen.getByLabelText("环境名称")).toHaveValue("");
    expect(screen.getByLabelText("API Key")).toHaveValue("");
  });

  it("首次启动明确选择项目并说明 Key 影响范围", async () => {
    const user = userEvent.setup();
    apiMocks.getAgentInstances.mockResolvedValue([
      {
        id: "instance-1",
        providerId: "provider-1",
        appType: "codex",
        name: "工作账号",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    renderDialog();

    expect(
      screen.getByText(/同一环境内的所有会话共享当前 Key/),
    ).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", {
        name: "选择项目并启动 Codex CLI",
      }),
    );

    await waitFor(() => {
      expect(apiMocks.openTerminal).toHaveBeenCalledWith(
        "provider-1",
        "codex",
        {
          cwd: "C:\\workspace",
          instanceId: "instance-1",
        },
      );
    });
  });

  it("删除实例前要求明确确认", async () => {
    const user = userEvent.setup();
    apiMocks.getAgentInstances.mockResolvedValue([
      {
        id: "instance-1",
        providerId: "provider-1",
        appType: "codex",
        name: "工作账号",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    renderDialog();

    await user.click(
      await screen.findByRole("button", { name: "删除运行环境 工作账号" }),
    );
    expect(apiMocks.deleteAgentInstance).not.toHaveBeenCalled();
    expect(
      screen.getByText(/系统凭据、环境数据及其会话将一并清理/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除环境和会话" }));

    await waitFor(() => {
      expect(apiMocks.deleteAgentInstance).toHaveBeenCalledWith(
        "instance-1",
        true,
      );
    });
  });
});
