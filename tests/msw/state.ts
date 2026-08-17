import type { AppId } from "@/lib/api/types";
import type {
  McpServer,
  Provider,
  SessionMessage,
  SessionMessagePage,
  SessionMeta,
  Settings,
} from "@/types";
import { deepClone } from "@/utils/deepClone";

type ProvidersByApp = Record<AppId, Record<string, Provider>>;
type CurrentProviderState = Record<AppId, string>;
type McpConfigState = Record<AppId, Record<string, McpServer>>;
type LiveProviderIdsByApp = Record<
  "opencode" | "openclaw" | "hermes" | "pi",
  string[]
>;

const createDefaultProviders = (): ProvidersByApp => ({
  claude: {
    "claude-1": {
      id: "claude-1",
      name: "Claude Default",
      settingsConfig: {},
      category: "official",
      sortIndex: 0,
      createdAt: Date.now(),
    },
    "claude-2": {
      id: "claude-2",
      name: "Claude Custom",
      settingsConfig: {},
      category: "custom",
      sortIndex: 1,
      createdAt: Date.now() + 1,
    },
  },
  "claude-desktop": {},
  codex: {
    "codex-1": {
      id: "codex-1",
      name: "Codex Default",
      settingsConfig: {},
      category: "official",
      sortIndex: 0,
      createdAt: Date.now(),
    },
    "codex-2": {
      id: "codex-2",
      name: "Codex Secondary",
      settingsConfig: {},
      category: "custom",
      sortIndex: 1,
      createdAt: Date.now() + 1,
    },
  },
  pi: {},
  gemini: {
    "gemini-1": {
      id: "gemini-1",
      name: "Gemini Default",
      settingsConfig: {
        env: {
          GEMINI_API_KEY: "test-key",
          GOOGLE_GEMINI_BASE_URL: "https://generativelanguage.googleapis.com",
        },
      },
      category: "official",
      sortIndex: 0,
      createdAt: Date.now(),
    },
  },
  grokbuild: {},
  opencode: {},
  openclaw: {},
  hermes: {},
});

const createDefaultCurrent = (): CurrentProviderState => ({
  claude: "claude-1",
  "claude-desktop": "",
  codex: "codex-1",
  pi: "",
  gemini: "gemini-1",
  grokbuild: "",
  opencode: "",
  openclaw: "",
  hermes: "",
});

let providers = createDefaultProviders();
let current = createDefaultCurrent();
let liveProviderIds: LiveProviderIdsByApp = {
  opencode: [],
  openclaw: [],
  hermes: [],
  pi: [],
};
let settingsState: Settings = {
  showInTray: true,
  minimizeToTrayOnClose: true,
  enableClaudePluginIntegration: false,
  claudeConfigDir: "/default/claude",
  codexConfigDir: "/default/codex",
  language: "zh",
};
let appConfigDirOverride: string | null = null;
const sessionMessageKey = (
  providerId: string,
  sourcePath: string,
  instanceId?: string,
) => `${providerId}:${instanceId ?? ""}:${sourcePath}`;

const legacySessionMessageKey = (providerId: string, sourcePath: string) =>
  `${providerId}:${sourcePath}`;

const readSessionMessages = (
  providerId: string,
  sourcePath: string,
  instanceId?: string,
) =>
  sessionMessagesState[sessionMessageKey(providerId, sourcePath, instanceId)] ??
  sessionMessagesState[legacySessionMessageKey(providerId, sourcePath)] ??
  [];

const createDefaultSessions = (): SessionMeta[] => {
  const now = Date.now();
  return [
    {
      providerId: "codex",
      sessionId: "codex-session-1",
      title: "Codex Session One",
      summary: "Codex summary",
      projectDir: "/mock/codex",
      createdAt: now - 2000,
      lastActiveAt: now - 1000,
      sourcePath: "/mock/codex/session-1.jsonl",
      resumeCommand: "codex resume codex-session-1",
    },
    {
      providerId: "claude",
      sessionId: "claude-session-1",
      title: "Claude Session One",
      summary: "Claude summary",
      projectDir: "/mock/claude",
      createdAt: now - 4000,
      lastActiveAt: now - 3000,
      sourcePath: "/mock/claude/session-1.jsonl",
      resumeCommand: "claude --resume claude-session-1",
    },
  ];
};

const createDefaultSessionMessages = (): Record<string, SessionMessage[]> => ({
  [sessionMessageKey("codex", "/mock/codex/session-1.jsonl")]: [
    {
      role: "user",
      content: "First codex message",
      ts: Date.now() - 1000,
    },
  ],
  [sessionMessageKey("claude", "/mock/claude/session-1.jsonl")]: [
    {
      role: "user",
      content: "First claude message",
      ts: Date.now() - 3000,
    },
  ],
});

let sessionsState = createDefaultSessions();
let sessionMessagesState = createDefaultSessionMessages();
let mcpConfigs: McpConfigState = {
  claude: {
    sample: {
      id: "sample",
      name: "Sample Claude Server",
      enabled: true,
      apps: {
        claude: true,
        codex: false,
        pi: false,
        gemini: false,
        opencode: false,
        openclaw: false,
        hermes: false,
      },
      server: {
        type: "stdio",
        command: "claude-server",
      },
    },
  },
  "claude-desktop": {},
  codex: {
    httpServer: {
      id: "httpServer",
      name: "HTTP Codex Server",
      enabled: false,
      apps: {
        claude: false,
        codex: true,
        pi: false,
        gemini: false,
        opencode: false,
        openclaw: false,
        hermes: false,
      },
      server: {
        type: "http",
        url: "http://localhost:3000",
      },
    },
  },
  pi: {},
  gemini: {},
  grokbuild: {},
  opencode: {},
  openclaw: {},
  hermes: {},
};

const cloneProviders = (value: ProvidersByApp) =>
  deepClone(value) as ProvidersByApp;

export const resetProviderState = () => {
  providers = createDefaultProviders();
  current = createDefaultCurrent();
  liveProviderIds = {
    opencode: [],
    openclaw: [],
    hermes: [],
    pi: [],
  };
  sessionsState = createDefaultSessions();
  sessionMessagesState = createDefaultSessionMessages();
  settingsState = {
    showInTray: true,
    minimizeToTrayOnClose: true,
    enableClaudePluginIntegration: false,
    claudeConfigDir: "/default/claude",
    codexConfigDir: "/default/codex",
    language: "zh",
  };
  appConfigDirOverride = null;
  mcpConfigs = {
    claude: {
      sample: {
        id: "sample",
        name: "Sample Claude Server",
        enabled: true,
        apps: {
          claude: true,
          codex: false,
          pi: false,
          gemini: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
        server: {
          type: "stdio",
          command: "claude-server",
        },
      },
    },
    "claude-desktop": {},
    codex: {
      httpServer: {
        id: "httpServer",
        name: "HTTP Codex Server",
        enabled: false,
        apps: {
          claude: false,
          codex: true,
          pi: false,
          gemini: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
        server: {
          type: "http",
          url: "http://localhost:3000",
        },
      },
    },
    pi: {},
    gemini: {},
    grokbuild: {},
    opencode: {},
    openclaw: {},
    hermes: {},
  };
};

export const getProviders = (appType: AppId) =>
  cloneProviders(providers)[appType] ?? {};

export const getCurrentProviderId = (appType: AppId) => current[appType] ?? "";

export const getLiveProviderIds = (
  appType: "opencode" | "openclaw" | "hermes" | "pi",
) => [...liveProviderIds[appType]];

export const setLiveProviderIds = (
  appType: "opencode" | "openclaw" | "hermes" | "pi",
  ids: string[],
) => {
  liveProviderIds[appType] = [...ids];
};

export const setCurrentProviderId = (appType: AppId, providerId: string) => {
  current[appType] = providerId;
};

export const updateProviders = (
  appType: AppId,
  data: Record<string, Provider>,
) => {
  providers[appType] = cloneProviders({ [appType]: data } as ProvidersByApp)[
    appType
  ];
};

export const setProviders = (
  appType: AppId,
  data: Record<string, Provider>,
) => {
  providers[appType] = deepClone(data) as Record<string, Provider>;
};

export const addProvider = (appType: AppId, provider: Provider) => {
  providers[appType] = providers[appType] ?? {};
  providers[appType][provider.id] = provider;
};

export const updateProvider = (appType: AppId, provider: Provider) => {
  if (!providers[appType]) return;
  providers[appType][provider.id] = {
    ...providers[appType][provider.id],
    ...provider,
  };
};

export const deleteProvider = (appType: AppId, providerId: string) => {
  if (!providers[appType]) return;
  delete providers[appType][providerId];
  if (current[appType] === providerId) {
    const fallback = Object.keys(providers[appType])[0] ?? "";
    current[appType] = fallback;
  }
};

export const updateSortOrder = (
  appType: AppId,
  updates: { id: string; sortIndex: number }[],
) => {
  if (!providers[appType]) return;
  updates.forEach(({ id, sortIndex }) => {
    const provider = providers[appType][id];
    if (provider) {
      providers[appType][id] = { ...provider, sortIndex };
    }
  });
};

export const listProviders = (appType: AppId) =>
  deepClone(providers[appType] ?? {}) as Record<string, Provider>;

export const getSettings = () => deepClone(settingsState) as Settings;

export const setSettings = (data: Partial<Settings>) => {
  settingsState = { ...settingsState, ...data };
};

export const getAppConfigDirOverride = () => appConfigDirOverride;

export const setAppConfigDirOverrideState = (value: string | null) => {
  appConfigDirOverride = value;
};

export const getMcpConfig = (appType: AppId) => {
  const servers = deepClone(mcpConfigs[appType] ?? {}) as Record<
    string,
    McpServer
  >;
  return {
    configPath: `/mock/${appType}.mcp.json`,
    servers,
  };
};

export const setMcpConfig = (
  appType: AppId,
  value: Record<string, McpServer>,
) => {
  mcpConfigs[appType] = deepClone(value) as Record<string, McpServer>;
};

export const setMcpServerEnabled = (
  appType: AppId,
  id: string,
  enabled: boolean,
) => {
  if (!mcpConfigs[appType]?.[id]) return;
  mcpConfigs[appType][id] = {
    ...mcpConfigs[appType][id],
    enabled,
  };
};

export const upsertMcpServer = (
  appType: AppId,
  id: string,
  server: McpServer,
) => {
  if (!mcpConfigs[appType]) {
    mcpConfigs[appType] = {};
  }
  mcpConfigs[appType][id] = deepClone(server) as McpServer;
};

export const deleteMcpServer = (appType: AppId, id: string) => {
  if (!mcpConfigs[appType]) return;
  delete mcpConfigs[appType][id];
};

export const listSessions = (
  providerId: string,
  scope: { type: "all" | "default" | "instance"; instanceId?: string } = {
    type: "default",
  },
) =>
  deepClone(
    sessionsState.filter(
      (session) =>
        session.providerId === providerId &&
        (scope.type === "all" ||
          (scope.type === "default" && !session.instanceId) ||
          (scope.type === "instance" &&
            session.instanceId === scope.instanceId)),
    ),
  ) as SessionMeta[];

export const getSessionMessages = (
  providerId: string,
  sourcePath: string,
  instanceId?: string,
) =>
  deepClone(
    readSessionMessages(providerId, sourcePath, instanceId),
  ) as SessionMessage[];

const SESSION_MESSAGE_PAGE_MAX_ITEMS = 50;
const SESSION_MESSAGE_PAGE_MAX_BYTES = 512 * 1024;

const truncateUtf8 = (value: string, maxBytes: number) => {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;
  let end = Math.min(value.length, maxBytes);
  while (end > 0 && encoder.encode(value.slice(0, end)).length > maxBytes) {
    end -= 1;
  }
  return value.slice(0, end);
};

export const getSessionMessagePage = (
  providerId: string,
  sourcePath: string,
  cursor?: string,
  instanceId?: string,
): SessionMessagePage => {
  const messages = getSessionMessages(providerId, sourcePath, instanceId);
  const start = cursor ? Number(cursor.replace(/^(?:index|fixture):/, "")) : 0;
  if (!Number.isInteger(start) || start < 0) {
    throw new Error("Invalid session message cursor");
  }

  const encoder = new TextEncoder();
  const items: SessionMessage[] = [];
  let contentBytes = 0;
  let index = start;

  while (
    index < messages.length &&
    items.length < SESSION_MESSAGE_PAGE_MAX_ITEMS
  ) {
    const source = messages[index];
    const sourceBytes = encoder.encode(source.content).length;
    const remainingBytes = SESSION_MESSAGE_PAGE_MAX_BYTES - contentBytes;
    if (items.length > 0 && sourceBytes > remainingBytes) break;

    const truncated = sourceBytes > remainingBytes;
    const content = truncated
      ? truncateUtf8(source.content, remainingBytes)
      : source.content;
    items.push({
      role: source.role,
      content,
      ts: source.ts,
      ...(truncated
        ? {
            contentCursor: `fixture:${index}`,
            contentBytes: sourceBytes,
          }
        : {}),
    });
    contentBytes += encoder.encode(content).length;
    index += 1;
  }

  return {
    items,
    nextCursor: index < messages.length ? `index:${index}` : undefined,
    hasMore: index < messages.length,
  };
};

export const getSessionMessageContent = (
  providerId: string,
  sourcePath: string,
  cursor: string,
  instanceId?: string,
) => {
  const index = Number(cursor.replace(/^(?:index|fixture):/, ""));
  const messages = getSessionMessages(providerId, sourcePath, instanceId);
  if (!Number.isInteger(index) || index < 0 || index >= messages.length) {
    throw new Error("Invalid session message content cursor");
  }
  return messages[index].content;
};

export const deleteSession = (
  providerId: string,
  sessionId: string,
  sourcePath: string,
  instanceId?: string,
) => {
  sessionsState = sessionsState.filter(
    (session) =>
      !(
        session.providerId === providerId &&
        session.sessionId === sessionId &&
        session.instanceId === instanceId &&
        session.sourcePath === sourcePath
      ),
  );
  delete sessionMessagesState[
    sessionMessageKey(providerId, sourcePath, instanceId)
  ];
  if (!instanceId) {
    delete sessionMessagesState[
      legacySessionMessageKey(providerId, sourcePath)
    ];
  }
  return true;
};

export const setSessionFixtures = (
  sessions: SessionMeta[],
  messages: Record<string, SessionMessage[]>,
) => {
  sessionsState = deepClone(sessions) as SessionMeta[];
  sessionMessagesState = deepClone(messages) as Record<
    string,
    SessionMessage[]
  >;
};
