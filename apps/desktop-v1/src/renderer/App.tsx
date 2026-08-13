import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Cable,
  ChevronRight,
  FileText,
  FolderKanban,
  Gauge,
  Menu,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Settings,
  Sparkles,
} from "lucide-react";
import type {
  DeploymentPreview,
  McpServer,
  PromptAsset,
} from "../shared/contracts";
import { useWorkspace } from "./useWorkspace";

export function App() {
  const [navbarOpened, { toggle: toggleNavbar, close: closeNavbar }] =
    useDisclosure();
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<DeploymentPreview | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routeResourceId = pathname.startsWith("/library/mcp/")
    ? decodeURIComponent(pathname.slice("/library/mcp/".length))
    : null;
  const { data, isLoading, error, refresh, isRefreshing, refreshError } =
    useWorkspace();
  const servers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.mcpServers ?? []).filter((server) => {
      if (!query) return true;
      return [server.id, server.name, server.sourceAgent].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [data?.mcpServers, search]);
  const selected =
    servers.find((server) => server.resourceId === routeResourceId) ??
    servers[0] ??
    null;
  const isMcpPage = pathname.startsWith("/library/mcp");

  useEffect(() => {
    if (
      pathname.startsWith("/library/mcp") &&
      servers.length > 0 &&
      !servers.some((server) => server.resourceId === routeResourceId)
    ) {
      void navigate({
        to: "/library/mcp/$resourceId",
        params: { resourceId: servers[0].resourceId },
        replace: true,
      });
    }
  }, [navigate, pathname, routeResourceId, servers]);

  return (
    <AppShell
      header={{ height: 48 }}
      navbar={{
        width: 232,
        breakpoint: "sm",
        collapsed: { mobile: !navbarOpened },
      }}
      padding={0}
    >
      <AppShell.Header className="titlebar">
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            color="gray"
            hiddenFrom="sm"
            onClick={toggleNavbar}
            aria-label="切换导航"
          >
            <Menu size={18} />
          </ActionIcon>
          <ThemeIcon variant="filled" color="dark" size={28} radius="sm">
            <Server size={16} />
          </ThemeIcon>
          <Text fw={650} size="sm">
            StackFerry 1.0
          </Text>
          <Badge variant="light" color="gray" size="sm">
            v1.0.0
          </Badge>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar className="sidebar" p="sm">
        <AppShell.Section>
          <Text px="sm" py={6} size="xs" fw={650} c="dimmed">
            工作区
          </Text>
          <NavLink
            active={isMcpPage}
            label="MCP 管理"
            leftSection={<Cable size={17} />}
            onClick={() => {
              closeNavbar();
              void navigate({ to: "/library/mcp" });
            }}
          />
          <NavLink
            active={pathname.startsWith("/library/providers")}
            label="Provider 路由"
            leftSection={<Bot size={17} />}
            onClick={() => {
              closeNavbar();
              void navigate({ to: "/library/providers" });
            }}
          />
          <NavLink
            active={pathname.startsWith("/library/profiles")}
            label="Profiles"
            leftSection={<FolderKanban size={17} />}
            onClick={() => {
              closeNavbar();
              void navigate({ to: "/library/profiles" });
            }}
          />
          <NavLink
            active={pathname.startsWith("/library/skills")}
            label="Skills"
            leftSection={<Sparkles size={17} />}
            onClick={() => {
              closeNavbar();
              void navigate({ to: "/library/skills" });
            }}
          />
          <NavLink
            active={pathname.startsWith("/library/prompts")}
            label="Prompts"
            leftSection={<FileText size={17} />}
            onClick={() => {
              closeNavbar();
              void navigate({ to: "/library/prompts" });
            }}
          />
        </AppShell.Section>

        <AppShell.Section grow component={ScrollArea} mt="md">
          <Text px="sm" py={6} size="xs" fw={650} c="dimmed">
            Agent
          </Text>
          {(data?.agents ?? []).map((agent) => (
            <NavLink
              key={agent.id}
              active={pathname === `/agents/${agent.id}`}
              label={agent.name}
              description={agent.installed ? "已检测" : "未检测"}
              leftSection={
                <span
                  className="agent-dot"
                  data-installed={agent.installed}
                />
              }
              onClick={() => {
                closeNavbar();
                void navigate({
                  to: "/agents/$agentId",
                  params: { agentId: agent.id },
                });
              }}
            />
          ))}
        </AppShell.Section>

        <AppShell.Section>
          <Divider mb="xs" />
          <NavLink
            active={pathname.startsWith("/system")}
            label="系统"
            leftSection={<Settings size={17} />}
            onClick={() => {
              closeNavbar();
              void navigate({ to: "/system" });
            }}
          />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main className="workspace-main">
        {!isMcpPage ? (
          <ControlPlanePage
            pathname={pathname}
            agents={data?.agents ?? []}
            prompts={data?.prompts ?? []}
            onPreviewPrompt={async (prompt) => {
              setDeploymentError(null);
              setPreview(await window.stackferry.previewPromptDeployment(prompt));
            }}
            onNavigate={(to) => {
              globalThis.location.hash = `#${to}`;
            }}
          />
        ) : (
          <>
        <Box className="workspace-toolbar">
          <Box>
            <Title order={2}>MCP 管理</Title>
            <Text size="sm" c="dimmed">
              从本机 Agent 发现服务器，不接管 Agent 自有运行时。
            </Text>
          </Box>
          <Group gap="sm" wrap="nowrap">
            <Button
              variant="light"
              disabled={!servers.some((server) => server.sourceAgent === "codex")}
              onClick={async () => {
                setDeploymentError(null);
                try {
                  setPreview(
                    await window.stackferry.previewMcpDeployment(
                      servers
                        .filter(
                          (server) =>
                            server.sourceAgent === selected?.sourceAgent,
                        )
                        .map((server) => ({ ...server, ownership: "managed" })),
                    ),
                  );
                } catch (previewError) {
                  setDeploymentError(
                    previewError instanceof Error
                      ? previewError.message
                      : String(previewError),
                  );
                }
              }}
            >
              预览应用
            </Button>
            <TextInput
              leftSection={<Search size={15} />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="搜索名称或来源"
              aria-label="搜索 MCP"
            />
            <Tooltip label="重新扫描 Agent 配置">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => refresh()}
                loading={isRefreshing}
                aria-label="重新扫描"
              >
                <RefreshCw size={17} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>

        {isLoading ? (
          <Center className="workspace-state">
            <Stack align="center" gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                正在读取本机 Agent 配置
              </Text>
            </Stack>
          </Center>
        ) : error ? (
          <WorkspaceError
            message={error instanceof Error ? error.message : String(error)}
            onRetry={() => refresh()}
          />
        ) : (
          <Box className="mcp-layout">
            <ScrollArea className="mcp-list" type="auto">
              <Group justify="space-between" px="md" py="sm">
                <Text size="xs" fw={650} c="dimmed">
                  已发现服务器
                </Text>
                <Badge variant="light" color="gray">
                  {servers.length}
                </Badge>
              </Group>
              {servers.length === 0 ? (
                <Stack align="center" gap="xs" px="lg" py={48}>
                  <Cable size={24} color="var(--mantine-color-gray-5)" />
                  <Text size="sm" fw={600}>
                    暂无可管理 MCP
                  </Text>
                  <Text size="xs" c="dimmed" ta="center">
                    点击重新扫描读取已安装 Agent 的配置。
                  </Text>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => refresh()}
                    loading={isRefreshing}
                  >
                    重新扫描
                  </Button>
                </Stack>
              ) : (
                <Stack gap={0}>
                  {servers.map((server) => (
                    <ServerRow
                      key={`${server.sourceAgent}:${server.id}`}
                      server={server}
                      selected={selected?.resourceId === server.resourceId}
                      onClick={() =>
                        void navigate({
                          to: "/library/mcp/$resourceId",
                          params: { resourceId: server.resourceId },
                        })
                      }
                    />
                  ))}
                </Stack>
              )}
            </ScrollArea>

            <ScrollArea className="mcp-detail" type="auto">
              {selected ? (
                <ServerDetail server={selected} />
              ) : (
                <Center h="100%">
                  <Text size="sm" c="dimmed">
                    选择服务器查看配置
                  </Text>
                </Center>
              )}
            </ScrollArea>
          </Box>
        )}

        {refreshError && (
          <Text className="refresh-error" size="xs" c="red">
            {refreshError instanceof Error
              ? refreshError.message
              : String(refreshError)}
          </Text>
        )}
        <Modal
          opened={preview !== null}
          onClose={() => setPreview(null)}
          title="确认配置变更"
          size="xl"
        >
          {preview && (
            <Stack>
              <Text size="sm">
                将更新 {preview.agentId} 的 {preview.changes.length} 个配置文件。
              </Text>
              {preview.changes.map((change) => (
                <Box key={change.path} className="deployment-preview">
                  <Text size="xs" fw={650} className="mono-value">
                    {change.path}
                  </Text>
                  <pre>{change.after}</pre>
                </Box>
              ))}
              {deploymentError && (
                <Text size="sm" c="red">
                  {deploymentError}
                </Text>
              )}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setPreview(null)}>
                  取消
                </Button>
                <Button
                  loading={isDeploying}
                  onClick={async () => {
                    setIsDeploying(true);
                    setDeploymentError(null);
                    try {
                      await window.stackferry.applyDeployment(preview.id);
                      setPreview(null);
                      refresh();
                    } catch (applyError) {
                      setDeploymentError(
                        applyError instanceof Error
                          ? applyError.message
                          : String(applyError),
                      );
                    } finally {
                      setIsDeploying(false);
                    }
                  }}
                >
                  确认应用
                </Button>
              </Group>
            </Stack>
          )}
        </Modal>
          </>
        )}
      </AppShell.Main>
    </AppShell>
  );
}

function ControlPlanePage({
  pathname,
  agents,
  prompts,
  onPreviewPrompt,
  onNavigate,
}: {
  pathname: string;
  agents: Array<{
    id: string;
    name: string;
    installed: boolean;
    configPath: string | null;
    version: string | null;
    health: string;
    capabilities: Record<string, string>;
  }>;
  prompts: PromptAsset[];
  onPreviewPrompt: (prompt: PromptAsset) => Promise<void>;
  onNavigate: (to: string) => void;
}) {
  const page = pageDefinition(pathname);

  if (page.kind === "overview") {
    const installedCount = agents.filter((agent) => agent.installed).length;
    return (
      <Stack className="control-page" gap="xl">
        <Box>
          <Text size="xs" c="dimmed" fw={650}>
            工作区概览
          </Text>
          <Title order={2}>本地 Agent 控制台</Title>
          <Text c="dimmed" size="sm">
            统一查看本机 Agent、配置资产和待处理操作。
          </Text>
        </Box>
        <div className="metric-grid">
          <MetricTile label="已检测 Agent" value={`${installedCount}/${agents.length}`} />
          <MetricTile label="管理能力" value="Claude Code / Codex" />
          <MetricTile label="路由状态" value="实验阶段" />
        </div>
        <section className="surface-section">
          <Group justify="space-between">
            <Box>
              <Text fw={650}>Agent 健康</Text>
              <Text size="xs" c="dimmed">配置发现结果来自本机扫描。</Text>
            </Box>
            <Gauge size={20} />
          </Group>
          <Stack gap={0} mt="md">
            {agents.map((agent) => (
              <button
                className="agent-summary"
                key={agent.id}
                type="button"
                onClick={() => onNavigate(`/agents/${agent.id}`)}
              >
                <span className="agent-dot" data-installed={agent.installed} />
                <span>
                  <strong>{agent.name}</strong>
                  <small>{agent.installed ? "可用" : "未检测到配置"}</small>
                </span>
                <Badge color={agent.health === "healthy" ? "teal" : "gray"} variant="light">
                  {agent.health}
                </Badge>
                <ChevronRight size={15} />
              </button>
            ))}
          </Stack>
        </section>
      </Stack>
    );
  }

  if (page.kind === "agent") {
    const agent = agents.find((item) => item.id === page.agentId);
    return (
      <Stack className="control-page" gap="xl">
        <Group justify="space-between" align="flex-end">
          <PageHeading title={agent?.name ?? page.agentId} eyebrow="Agent 详情" />
          <Badge color={agent?.installed ? "teal" : "gray"} variant="light">
            {agent?.installed ? "已检测" : "未安装"}
          </Badge>
        </Group>
        <Group className="agent-detail-tabs" gap="xs" wrap="wrap">
          <Button
            variant="light"
            leftSection={<Cable size={16} />}
            onClick={() => {
              globalThis.location.hash = "#/library/mcp";
            }}
          >
            MCP
          </Button>
          <Button
            variant="default"
            leftSection={<Bot size={16} />}
            onClick={() => {
              globalThis.location.hash = "#/library/providers";
            }}
          >
            Provider
          </Button>
          <Button
            variant="default"
            leftSection={<FileText size={16} />}
            onClick={() => {
              globalThis.location.hash = "#/library/prompts";
            }}
          >
            Prompt
          </Button>
          <Button
            variant="default"
            leftSection={<Sparkles size={16} />}
            onClick={() => {
              globalThis.location.hash = "#/library/skills";
            }}
          >
            Skills
          </Button>
        </Group>
        <div className="detail-grid">
          <InfoPanel title="运行状态" icon={<Gauge size={18} />}>
            <DetailField label="状态" value={agent?.installed ? "已检测" : "未检测到配置"} />
            <DetailField label="健康" value={agent?.health ?? "unknown"} />
            <DetailField label="版本" value={agent?.version ?? "尚未探测"} />
            <DetailField label="配置路径" value={agent?.configPath ?? "无"} mono />
          </InfoPanel>
          <InfoPanel title="能力" icon={<SlidersHorizontal size={18} />}>
            {Object.entries(agent?.capabilities ?? {}).map(([name, level]) => (
              <Group justify="space-between" key={name}>
                <Text size="sm">{name}</Text>
                <Badge variant="light" color={level === "managed" || level === "core" ? "teal" : "gray"}>
                  {level}
                </Badge>
              </Group>
            ))}
          </InfoPanel>
        </div>
      </Stack>
    );
  }

  if (pathname.startsWith("/library/prompts")) {
    return (
      <PromptWorkspace
        prompts={prompts}
        onPreview={onPreviewPrompt}
      />
    );
  }

  const title = page.title;
  return (
    <Stack className="control-page" gap="xl">
      <PageHeading title={title} eyebrow="Library" />
      <section className="empty-library">
        <ThemeIcon variant="light" color="teal" size={44}>
          {page.icon}
        </ThemeIcon>
        <Text fw={650}>{title} 控制面</Text>
        <Text size="sm" c="dimmed" ta="center">
          Claude Code 与 Codex 的发现、预览、原子应用、验证和回滚正在接入此工作区。
        </Text>
        <Badge variant="outline" color="gray">后端契约待接入</Badge>
      </section>
    </Stack>
  );
}

function PromptWorkspace({
  prompts,
  onPreview,
}: {
  prompts: PromptAsset[];
  onPreview: (prompt: PromptAsset) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(prompts[0]?.resourceId ?? "");
  const selected =
    prompts.find((prompt) => prompt.resourceId === selectedId) ??
    prompts[0] ??
    null;
  const [content, setContent] = useState(selected?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected) {
      setSelectedId(selected.resourceId);
      setContent(selected.content);
      setError(null);
    }
  }, [selected?.resourceId, selected?.content]);

  return (
    <Stack className="control-page prompt-page" gap="lg">
      <Group justify="space-between" align="flex-end">
        <PageHeading title="Prompts" eyebrow="Library" />
        <Button
          disabled={!selected || content === selected.content}
          loading={saving}
          onClick={async () => {
            if (!selected) return;
            setSaving(true);
            setError(null);
            try {
              await onPreview({
                ...selected,
                content,
                ownership: "managed",
              });
            } catch (previewError) {
              setError(
                previewError instanceof Error
                  ? previewError.message
                  : String(previewError),
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          预览变更
        </Button>
      </Group>
      <div className="prompt-layout">
        <Stack className="prompt-sources" gap={0}>
          <Text size="xs" c="dimmed" fw={650} p="md">配置来源</Text>
          {prompts.map((prompt) => (
            <button
              type="button"
              key={prompt.resourceId}
              className="prompt-source"
              data-selected={prompt.resourceId === selected?.resourceId}
              onClick={() => setSelectedId(prompt.resourceId)}
            >
              <FileText size={17} />
              <span>
                <strong>{prompt.sourceAgent === "claude" ? "Claude Code" : "Codex"}</strong>
                <small>{prompt.exists ? prompt.path : "尚未创建"}</small>
              </span>
            </button>
          ))}
        </Stack>
        <section className="prompt-editor">
          {selected ? (
            <>
              <Group justify="space-between">
                <Box>
                  <Text fw={650}>
                    {selected.sourceAgent === "claude" ? "CLAUDE.md" : "AGENTS.md"}
                  </Text>
                  <Text size="xs" c="dimmed" className="mono-value">{selected.path}</Text>
                </Box>
                <Badge variant="light" color={selected.exists ? "teal" : "gray"}>
                  {selected.exists ? "已发现" : "新文件"}
                </Badge>
              </Group>
              <Textarea
                aria-label="Prompt 内容"
                value={content}
                onChange={(event) => setContent(event.currentTarget.value)}
                autosize={false}
                className="prompt-textarea"
              />
              {error && <Text size="sm" c="red">{error}</Text>}
            </>
          ) : (
            <Center h="100%"><Text c="dimmed">未检测到可管理 Agent</Text></Center>
          )}
        </section>
      </div>
    </Stack>
  );
}

function PageHeading({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" fw={650}>{eyebrow}</Text>
      <Title order={2}>{title}</Title>
    </Box>
  );
}

function InfoPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-section">
      <Group gap="xs"><span className="panel-icon">{icon}</span><Text fw={650}>{title}</Text></Group>
      <Stack gap="md" mt="md">{children}</Stack>
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <section className="metric-tile">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="lg">{value}</Text>
    </section>
  );
}

function pageDefinition(pathname: string):
  | { kind: "overview" }
  | { kind: "agent"; agentId: string }
  | { kind: "library"; title: string; icon: React.ReactNode } {
  if (pathname === "/" || pathname === "/overview") return { kind: "overview" };
  if (pathname.startsWith("/agents/")) {
    return { kind: "agent", agentId: pathname.slice("/agents/".length) };
  }
  if (pathname.startsWith("/library/providers")) {
    return { kind: "library", title: "Provider 路由", icon: <Bot size={20} /> };
  }
  if (pathname.startsWith("/library/profiles")) {
    return { kind: "library", title: "Profiles", icon: <FolderKanban size={20} /> };
  }
  if (pathname.startsWith("/library/skills")) {
    return { kind: "library", title: "Skills", icon: <Sparkles size={20} /> };
  }
  if (pathname.startsWith("/library/prompts")) {
    return { kind: "library", title: "Prompts", icon: <FileText size={20} /> };
  }
  return { kind: "library", title: "系统", icon: <Settings size={20} /> };
}

function ServerRow({
  server,
  selected,
  onClick,
}: {
  server: McpServer;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="server-row"
      data-selected={selected}
      onClick={onClick}
    >
      <ThemeIcon variant="light" color="gray" size={34}>
        <Cable size={17} />
      </ThemeIcon>
      <Box className="server-row-copy">
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600} truncate>
            {server.name}
          </Text>
          <Badge variant="light" color="teal" size="xs">
            {server.sourceAgent}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed" truncate>
          {transportSummary(server)}
        </Text>
      </Box>
      <ChevronRight size={15} />
    </button>
  );
}

function ServerDetail({ server }: { server: McpServer }) {
  return (
    <Stack gap="lg" p="xl">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Text size="xs" c="dimmed" fw={650}>
            {server.sourceAgent.toUpperCase()}
          </Text>
          <Title order={3}>{server.name}</Title>
        </Box>
        <Badge color="teal" variant="light">
          已发现
        </Badge>
      </Group>

      <Divider />

      <Stack gap="md">
        <DetailField label="所有权" value="Agent 配置中发现" />
        <DetailField label="传输方式" value={server.transport.type} />
        <DetailField
          label={server.transport.type === "stdio" ? "启动命令" : "服务地址"}
          value={transportSummary(server)}
          mono
        />
        {server.transport.type === "stdio" &&
          server.transport.args.length > 0 && (
            <DetailField
              label="参数"
              value={server.transport.args.join(" ")}
              mono
            />
          )}
      </Stack>

      <Box className="ownership-note">
        <Text size="sm" fw={600}>
          只读发现
        </Text>
        <Text size="xs" c="dimmed">
          原型阶段只读取 Agent 配置。Agent 自有运行时不会进入管理列表，也不会被写回。
        </Text>
      </Box>
    </Stack>
  );
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Box>
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      <Text size="sm" className={mono ? "mono-value" : undefined}>
        {value}
      </Text>
    </Box>
  );
}

function WorkspaceError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Center className="workspace-state">
      <Stack align="center" gap="sm">
        <Text size="sm" fw={600}>
          无法加载工作区
        </Text>
        <Text size="xs" c="dimmed">
          {message}
        </Text>
        <Button variant="light" size="xs" onClick={onRetry}>
          重试
        </Button>
      </Stack>
    </Center>
  );
}

function transportSummary(server: McpServer): string {
  return server.transport.type === "stdio"
    ? server.transport.command
    : server.transport.url;
}
