import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSessionSearch } from "@/hooks/useSessionSearch";
import { useTranslation } from "react-i18next";
import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  List,
  ListTree,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useDeleteSessionMutation,
  useSessionMessagesQuery,
  useSessionsQuery,
} from "@/lib/query";
import {
  isSessionProviderId,
  SESSION_PROVIDER_IDS,
  sessionsApi,
  type SessionScope,
  type SessionProviderId,
} from "@/lib/api";
import { providersApi, type AgentInstance } from "@/lib/api/providers";
import type { SessionMessage, SessionMeta } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ManagementWorkbench,
  ResourceToolbar,
} from "@/components/common/ManagementWorkbench";
import { extractErrorMessage } from "@/utils/errorUtils";
import { ProviderIcon } from "@/components/ProviderIcon";
import { SessionItem } from "./SessionItem";
import { SessionMessageItem } from "./SessionMessageItem";
import { SessionTocDialog, SessionTocSidebar } from "./SessionToc";
import {
  extractCodexPromptPreview,
  formatSessionMessagePreview,
  formatSessionTitle,
  formatTimestamp,
  getBaseName,
  getProviderIconName,
  getProviderLabel,
  getSessionDirectoryGroupKey,
  getSessionKey,
  groupSessionsByProviderAndDirectory,
  type SessionDirectoryGroup,
  shouldHideCodexMessageFromToc,
} from "./utils";

const SESSION_LIST_VIEW_MODE_STORAGE_KEY =
  "stackferry.sessionManager.listViewMode";
const SESSION_GROUP_EXPANSION_STORAGE_KEY =
  "stackferry.sessionManager.groupExpansionState";
const SESSION_PROVIDER_STORAGE_KEY = "stackferry.sessions.providerFilter";
const SESSION_SCOPE_STORAGE_KEY = "stackferry.sessions.scopeFilter";
const ALL_ENVIRONMENTS_VALUE = "__all_environments__";
const DEFAULT_ENVIRONMENT_VALUE = "__default_environment__";
const SESSION_LIST_ROW_ESTIMATE = 68;
const SESSION_LIST_FALLBACK_RECT = { width: 320, height: 640 };
const MESSAGE_LIST_FALLBACK_RECT = { width: 640, height: 640 };

const observeSessionListRect: typeof observeElementRect = (instance, onRect) =>
  observeElementRect(instance, (rect) =>
    onRect({
      width: rect.width > 0 ? rect.width : SESSION_LIST_FALLBACK_RECT.width,
      height: rect.height > 0 ? rect.height : SESSION_LIST_FALLBACK_RECT.height,
    }),
  );

const observeMessageListRect: typeof observeElementRect = (instance, onRect) =>
  observeElementRect(instance, (rect) =>
    onRect({
      width: rect.width > 0 ? rect.width : MESSAGE_LIST_FALLBACK_RECT.width,
      height: rect.height > 0 ? rect.height : MESSAGE_LIST_FALLBACK_RECT.height,
    }),
  );

type SessionListViewMode = "flat" | "grouped";

type GroupSelectionState = {
  checked: boolean | "indeterminate";
  isSelected: boolean;
  selectedCount: number;
  selectableCount: number;
};

type SessionGroupExpansionState = {
  expandedProviderIds: Set<string>;
  expandedDirectoryKeys: Set<string>;
};

const readInitialSessionProvider = (): SessionProviderId => {
  if (typeof window === "undefined") return "codex";
  const stored = window.localStorage.getItem(SESSION_PROVIDER_STORAGE_KEY);
  return isSessionProviderId(stored) ? stored : "codex";
};

const readInitialSessionScope = (): SessionScope => {
  if (typeof window === "undefined") return { type: "all" };
  const stored = window.localStorage.getItem(SESSION_SCOPE_STORAGE_KEY);
  if (!stored || stored === ALL_ENVIRONMENTS_VALUE) {
    return { type: "all" };
  }
  if (stored === DEFAULT_ENVIRONMENT_VALUE) return { type: "default" };
  return { type: "instance", instanceId: stored };
};

const readInitialSessionListViewMode = (): SessionListViewMode => {
  if (typeof window === "undefined") return "flat";
  const stored = window.localStorage.getItem(
    SESSION_LIST_VIEW_MODE_STORAGE_KEY,
  );
  return stored === "grouped" || stored === "flat" ? stored : "flat";
};

const readInitialSessionGroupExpansionState =
  (): SessionGroupExpansionState => {
    if (typeof window === "undefined") {
      return {
        expandedProviderIds: new Set(),
        expandedDirectoryKeys: new Set(),
      };
    }

    try {
      const stored = window.localStorage.getItem(
        SESSION_GROUP_EXPANSION_STORAGE_KEY,
      );
      const parsed = stored ? JSON.parse(stored) : null;

      if (!parsed || typeof parsed !== "object") {
        return {
          expandedProviderIds: new Set(),
          expandedDirectoryKeys: new Set(),
        };
      }

      const expandedProviderIds = Array.isArray(parsed.expandedProviderIds)
        ? parsed.expandedProviderIds.filter(
            (providerId: unknown): providerId is string =>
              typeof providerId === "string",
          )
        : [];
      const expandedDirectoryKeys = Array.isArray(parsed.expandedDirectoryKeys)
        ? parsed.expandedDirectoryKeys.filter(
            (directoryKey: unknown): directoryKey is string =>
              typeof directoryKey === "string",
          )
        : [];

      return {
        expandedProviderIds: new Set(expandedProviderIds),
        expandedDirectoryKeys: new Set(expandedDirectoryKeys),
      };
    } catch {
      return {
        expandedProviderIds: new Set(),
        expandedDirectoryKeys: new Set(),
      };
    }
  };

const serializeSessionGroupExpansionState = (
  expandedProviderGroups: Set<string>,
  expandedDirectoryGroups: Set<string>,
) =>
  JSON.stringify({
    expandedProviderIds: Array.from(expandedProviderGroups).sort(),
    expandedDirectoryKeys: Array.from(expandedDirectoryGroups).sort(),
  });

const filterSetToAllowedValues = (
  current: Set<string>,
  allowedValues: Set<string>,
) => {
  let changed = false;
  const next = new Set<string>();

  current.forEach((value) => {
    if (allowedValues.has(value)) {
      next.add(value);
    } else {
      changed = true;
    }
  });

  return changed ? next : current;
};

interface SessionManagerPageProps {
  initialScope?: SessionScope;
  initialInstanceId?: string | null;
  onInitialInstanceApplied?: () => void;
}

export function SessionManagerPage({
  initialScope,
  initialInstanceId,
  onInitialInstanceApplied,
}: SessionManagerPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const detailRef = useRef<HTMLDivElement | null>(null);
  const sessionListRootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messageLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(
    null,
  );
  const [tocDialogOpen, setTocDialogOpen] = useState(false);
  const [compactDetailOpen, setCompactDetailOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<SessionMeta[] | null>(
    null,
  );
  const [selectedSessionKeys, setSelectedSessionKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);

  const [search, setSearch] = useState("");
  const [sessionProvider, setSessionProvider] = useState<SessionProviderId>(
    readInitialSessionProvider,
  );
  const [instances, setInstances] = useState<AgentInstance[]>([]);
  const [instanceProviderNames, setInstanceProviderNames] = useState<
    Map<string, string>
  >(new Map());
  const [sessionScope, setSessionScope] = useState<SessionScope>(
    () =>
      initialScope ??
      (initialInstanceId
        ? { type: "instance", instanceId: initialInstanceId }
        : readInitialSessionScope()),
  );
  const scopedSessionScope = useMemo<SessionScope>(() => {
    return sessionProvider === "codex" || sessionProvider === "claude"
      ? sessionScope
      : { type: "default" };
  }, [sessionProvider, sessionScope]);
  const { data, isLoading, refreshSessions } = useSessionsQuery(
    sessionProvider,
    scopedSessionScope,
  );
  const instanceNames = useMemo(
    () => new Map(instances.map((instance) => [instance.id, instance.name])),
    [instances],
  );
  const getEnvironmentLabel = useCallback(
    (instance: AgentInstance) =>
      `${instance.name} · ${
        instanceProviderNames.get(instance.id) ?? instance.providerId
      }`,
    [instanceProviderNames],
  );
  const sessions = useMemo(
    () =>
      (data ?? []).map((session) => ({
        ...session,
        instanceName: session.instanceId
          ? instanceNames.get(session.instanceId)
          : undefined,
      })),
    [data, instanceNames],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [listViewMode, setListViewMode] = useState<SessionListViewMode>(
    readInitialSessionListViewMode,
  );
  const [initialGroupExpansionState] = useState(
    readInitialSessionGroupExpansionState,
  );
  const [expandedDirectoryGroups, setExpandedDirectoryGroups] = useState<
    Set<string>
  >(() => initialGroupExpansionState.expandedDirectoryKeys);

  const { search: searchSessions } = useSessionSearch({
    sessions,
  });
  const deferredSearch = useDeferredValue(search);

  const filteredSessions = useMemo(() => {
    return searchSessions(deferredSearch);
  }, [deferredSearch, searchSessions]);

  const sessionListVirtualizer = useVirtualizer({
    count: listViewMode === "flat" ? filteredSessions.length : 0,
    getScrollElement: () =>
      sessionListRootRef.current?.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ) ?? null,
    estimateSize: () => SESSION_LIST_ROW_ESTIMATE,
    measureElement: (element) =>
      element.getBoundingClientRect().height || SESSION_LIST_ROW_ESTIMATE,
    getItemKey: (index) => getSessionKey(filteredSessions[index]),
    overscan: 6,
    initialRect: SESSION_LIST_FALLBACK_RECT,
    observeElementRect: observeSessionListRect,
  });

  const groupedSessions = useMemo(() => {
    if (listViewMode !== "grouped") return [];
    return groupSessionsByProviderAndDirectory(
      filteredSessions,
      t("sessionManager.unknownDirectory", {
        defaultValue: "未知目录",
      }),
    );
  }, [filteredSessions, listViewMode, t]);

  const validGroupExpansionKeys = useMemo(() => {
    if (listViewMode !== "grouped") {
      return {
        providerIds: new Set<string>(),
        directoryKeys: new Set<string>(),
      };
    }
    return {
      providerIds: new Set(sessions.map((session) => session.providerId)),
      directoryKeys: new Set(
        sessions.map((session) =>
          getSessionDirectoryGroupKey(session.providerId, session.projectDir),
        ),
      ),
    };
  }, [listViewMode, sessions]);

  useEffect(() => {
    if (!initialInstanceId) return;
    setSessionScope({ type: "instance", instanceId: initialInstanceId });
    onInitialInstanceApplied?.();
  }, [initialInstanceId, onInitialInstanceApplied]);

  useEffect(() => {
    window.localStorage.setItem(SESSION_PROVIDER_STORAGE_KEY, sessionProvider);
  }, [sessionProvider]);

  useEffect(() => {
    if (sessionProvider !== "codex" && sessionProvider !== "claude") {
      setInstances([]);
      setInstanceProviderNames(new Map());
      return;
    }
    let cancelled = false;
    void providersApi
      .getAll(sessionProvider)
      .then(async (providers) => {
        const instanceGroups = await Promise.all(
          Object.keys(providers).map((providerId) =>
            providersApi.getAgentInstances(providerId, sessionProvider),
          ),
        );
        return {
          providers,
          instances: instanceGroups.flat(),
        };
      })
      .then(({ providers, instances: nextInstances }) => {
        if (!cancelled) {
          setInstances(nextInstances);
          setInstanceProviderNames(
            new Map(
              nextInstances.map((instance) => [
                instance.id,
                providers[instance.providerId]?.name ?? instance.providerId,
              ]),
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInstances([]);
          setInstanceProviderNames(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionProvider]);

  useEffect(() => {
    const value =
      sessionScope.type === "all"
        ? ALL_ENVIRONMENTS_VALUE
        : sessionScope.type === "default"
          ? DEFAULT_ENVIRONMENT_VALUE
          : sessionScope.instanceId;
    window.localStorage.setItem(SESSION_SCOPE_STORAGE_KEY, value);
  }, [sessionScope]);

  useEffect(() => {
    if (
      sessionScope.type === "instance" &&
      instances.length > 0 &&
      !instances.some((instance) => instance.id === sessionScope.instanceId)
    ) {
      setSessionScope({ type: "all" });
    }
  }, [instances, sessionScope]);

  const handleSessionProviderChange = (value: string) => {
    if (!isSessionProviderId(value) || value === sessionProvider) return;

    setSelectedKey(null);
    setSelectedSessionKeys(new Set());
    setDeleteTargets(null);
    setSelectionMode(false);
    setSearch("");
    setCompactDetailOpen(false);
    setTocDialogOpen(false);
    setActiveMessageIndex(null);
    setSessionProvider(value);
  };

  useEffect(() => {
    window.localStorage.setItem(
      SESSION_LIST_VIEW_MODE_STORAGE_KEY,
      listViewMode,
    );
  }, [listViewMode]);

  useEffect(() => {
    window.localStorage.setItem(
      SESSION_GROUP_EXPANSION_STORAGE_KEY,
      serializeSessionGroupExpansionState(
        new Set([sessionProvider]),
        expandedDirectoryGroups,
      ),
    );
  }, [expandedDirectoryGroups, sessionProvider]);

  useEffect(() => {
    if (isLoading || listViewMode !== "grouped") return;

    setExpandedDirectoryGroups((current) =>
      filterSetToAllowedValues(current, validGroupExpansionKeys.directoryKeys),
    );
  }, [isLoading, listViewMode, validGroupExpansionKeys]);

  useEffect(() => {
    if (filteredSessions.length === 0) {
      setSelectedKey(null);
      return;
    }
    const exists = selectedKey
      ? filteredSessions.some(
          (session) => getSessionKey(session) === selectedKey,
        )
      : false;
    if (!exists) {
      setSelectedKey(getSessionKey(filteredSessions[0]));
    }
  }, [filteredSessions, selectedKey]);

  const selectedSession = useMemo(() => {
    if (!selectedKey) return null;
    return (
      filteredSessions.find(
        (session) => getSessionKey(session) === selectedKey,
      ) || null
    );
  }, [filteredSessions, selectedKey]);

  const listViewModeLabel =
    listViewMode === "grouped"
      ? t("sessionManager.viewModeGrouped", {
          defaultValue: "分类",
        })
      : t("sessionManager.viewModeFlat", {
          defaultValue: "列表",
        });

  const {
    data: messagePages,
    isLoading: isLoadingMessages,
    isError: isMessageQueryError,
    error: messageQueryError,
    refetch: refetchMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useSessionMessagesQuery(
    selectedSession?.providerId,
    selectedSession?.sourcePath,
    selectedSession?.instanceId,
  );
  const messages = useMemo(
    () => messagePages?.pages.flatMap((page) => page.items) ?? [],
    [messagePages],
  );

  const loadMessageContent = useCallback(
    async (message: SessionMessage) => {
      if (
        !message.contentCursor ||
        !selectedSession?.providerId ||
        !selectedSession.sourcePath
      ) {
        return message.content;
      }

      return queryClient.fetchQuery({
        queryKey: [
          "sessionMessageContent",
          selectedSession.providerId,
          selectedSession.instanceId,
          selectedSession.sourcePath,
          message.contentCursor,
        ],
        queryFn: () =>
          selectedSession.instanceId
            ? sessionsApi.getMessageContent(
                selectedSession.providerId,
                selectedSession.sourcePath!,
                message.contentCursor!,
                selectedSession.instanceId,
              )
            : sessionsApi.getMessageContent(
                selectedSession.providerId,
                selectedSession.sourcePath!,
                message.contentCursor!,
              ),
        staleTime: 5 * 60 * 1000,
      });
    },
    [queryClient, selectedSession],
  );

  useEffect(() => {
    const sentinel = messageLoadMoreRef.current;
    const root = scrollContainerRef.current;
    if (
      !sentinel ||
      !root ||
      !hasNextPage ||
      isFetchNextPageError ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "320px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    selectedKey,
  ]);

  const deleteSessionMutation = useDeleteSessionMutation();
  const isDeleting = deleteSessionMutation.isPending || isBatchDeleting;

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    observeElementRect: observeMessageListRect,
    estimateSize: () => 120,
    overscan: 5,
    gap: 12,
    getItemKey: (index) =>
      `${selectedSession?.providerId ?? ""}:${selectedSession?.sourcePath ?? ""}:${index}`,
  });
  const measuredMessageRows = virtualizer.getVirtualItems();
  const messageRows =
    measuredMessageRows.length > 0
      ? measuredMessageRows
      : messages.slice(0, 8).map((_, index) => ({
          key: `${selectedSession?.providerId ?? ""}:${selectedSession?.sourcePath ?? ""}:fallback:${index}`,
          index,
          start: index * 120,
          size: 120,
          end: (index + 1) * 120,
          lane: 0,
        }));
  const messageListHeight = Math.max(
    virtualizer.getTotalSize(),
    messages.length * 120,
  );
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedKey]);

  useEffect(() => {
    const validKeys = new Set(
      sessions.map((session) => getSessionKey(session)),
    );
    setSelectedSessionKeys((current) => {
      let changed = false;
      const next = new Set<string>();
      current.forEach((key) => {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [sessions]);

  const isCodexSession = selectedSession?.providerId === "codex";

  const userMessagesToc = useMemo(() => {
    return messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => {
        if (msg.role.toLowerCase() !== "user") return false;
        return !(isCodexSession && shouldHideCodexMessageFromToc(msg.content));
      })
      .map(({ msg, index }) => {
        const previewContent = isCodexSession
          ? extractCodexPromptPreview(msg.content)
          : msg.content;

        return {
          index,
          preview: formatSessionMessagePreview(previewContent),
          ts: msg.ts,
        };
      });
  }, [isCodexSession, messages]);

  const scrollToMessage = (index: number) => {
    virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
    setActiveMessageIndex(index);
    setTocDialogOpen(false);
    setTimeout(() => setActiveMessageIndex(null), 2000);
  };

  const handleCopy = useCallback(
    async (text: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(successMessage);
      } catch (error) {
        toast.error(
          extractErrorMessage(error) ||
            t("common.error", { defaultValue: "Copy failed" }),
        );
      }
    },
    [t],
  );

  const handleMessageCopy = useCallback(
    (content: string) => {
      return handleCopy(
        content,
        t("sessionManager.messageCopied", { defaultValue: "已复制消息内容" }),
      );
    },
    [handleCopy, t],
  );

  const handleResume = async () => {
    if (!selectedSession?.resumeCommand) return;

    try {
      await sessionsApi.launchTerminal({
        command: selectedSession.resumeCommand,
        cwd: selectedSession.projectDir ?? undefined,
        providerId: selectedSession.providerId,
        instanceId: selectedSession.instanceId,
        sessionId: selectedSession.sessionId,
        sourcePath: selectedSession.sourcePath,
      });
      toast.success(t("sessionManager.terminalLaunched"));
    } catch (error) {
      const fallback = selectedSession.resumeCommand;
      await handleCopy(fallback, t("sessionManager.resumeFallbackCopied"));
      toast.error(extractErrorMessage(error) || t("sessionManager.openFailed"));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargets || deleteTargets.length === 0 || isDeleting) {
      return;
    }

    const targets = deleteTargets.filter((session) => session.sourcePath);
    setDeleteTargets(null);

    if (targets.length === 0) {
      return;
    }

    if (targets.length === 1) {
      const [target] = targets;
      await deleteSessionMutation.mutateAsync({
        providerId: target.providerId,
        sessionId: target.sessionId,
        instanceId: target.instanceId,
        sourcePath: target.sourcePath!,
      });
      setSelectedSessionKeys((current) => {
        const next = new Set(current);
        next.delete(getSessionKey(target));
        return next;
      });
      return;
    }

    setIsBatchDeleting(true);
    try {
      const results = await sessionsApi.deleteMany(
        targets.map((session) => ({
          providerId: session.providerId,
          sessionId: session.sessionId,
          instanceId: session.instanceId,
          sourcePath: session.sourcePath!,
        })),
      );

      const deletedKeys = results
        .filter((result) => result.success)
        .map(
          (result) =>
            `${result.providerId}:${result.instanceId ?? ""}:${result.sessionId}:${result.sourcePath ?? ""}`,
        );

      const failedErrors = results
        .filter((result) => !result.success)
        .map((result) => result.error || t("common.unknown"));

      if (deletedKeys.length > 0) {
        const deletedKeySet = new Set(deletedKeys);
        queryClient
          .getQueriesData<SessionMeta[]>({
            queryKey: ["sessions", sessionProvider],
          })
          .forEach(([queryKey]) => {
            queryClient.setQueryData<SessionMeta[]>(queryKey, (current) =>
              (current ?? []).filter(
                (session) => !deletedKeySet.has(getSessionKey(session)),
              ),
            );
          });
      }

      results
        .filter((result) => result.success)
        .forEach((result) => {
          queryClient.removeQueries({
            queryKey: [
              "sessionMessages",
              result.providerId,
              result.instanceId,
              result.sourcePath,
            ],
          });
        });

      setSelectedSessionKeys((current) => {
        const next = new Set(current);
        deletedKeys.forEach((key) => next.delete(key));
        return next;
      });

      await queryClient.invalidateQueries({
        queryKey: ["sessions", sessionProvider],
      });

      if (deletedKeys.length > 0) {
        toast.success(
          t("sessionManager.batchDeleteSuccess", {
            defaultValue: "已删除 {{count}} 个会话",
            count: deletedKeys.length,
          }),
        );
      }

      if (failedErrors.length > 0) {
        toast.error(
          t("sessionManager.batchDeleteFailed", {
            defaultValue: "{{failed}} 个会话删除失败",
            failed: failedErrors.length,
          }),
          {
            description: failedErrors[0],
          },
        );
      }
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("sessionManager.batchDeleteRequestFailed", {
            defaultValue: "批量删除失败，请稍后重试",
          }),
      );
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const deletableFilteredSessions = useMemo(
    () => filteredSessions.filter((session) => Boolean(session.sourcePath)),
    [filteredSessions],
  );

  const selectedSessions = useMemo(
    () =>
      sessions.filter((session) =>
        selectedSessionKeys.has(getSessionKey(session)),
      ),
    [sessions, selectedSessionKeys],
  );

  const selectedDeletableSessions = useMemo(
    () => selectedSessions.filter((session) => Boolean(session.sourcePath)),
    [selectedSessions],
  );

  useEffect(() => {
    if (!selectionMode) return;

    const visibleKeys = new Set(
      deletableFilteredSessions.map((session) => getSessionKey(session)),
    );

    setSelectedSessionKeys((current) => {
      let changed = false;
      const next = new Set<string>();

      current.forEach((key) => {
        if (visibleKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [deletableFilteredSessions, selectionMode]);

  const allFilteredSelected =
    deletableFilteredSessions.length > 0 &&
    deletableFilteredSessions.every((session) =>
      selectedSessionKeys.has(getSessionKey(session)),
    );

  const getGroupSelectionState = (
    groupSessions: SessionMeta[],
  ): GroupSelectionState => {
    const selectableSessions = groupSessions.filter((session) =>
      Boolean(session.sourcePath),
    );
    const selectedCount = selectableSessions.filter((session) =>
      selectedSessionKeys.has(getSessionKey(session)),
    ).length;
    const isSelected =
      selectableSessions.length > 0 &&
      selectedCount === selectableSessions.length;

    return {
      checked:
        selectedCount === 0 ? false : isSelected ? true : "indeterminate",
      isSelected,
      selectedCount,
      selectableCount: selectableSessions.length,
    };
  };

  const toggleSessionChecked = (session: SessionMeta, checked: boolean) => {
    if (!session.sourcePath) return;
    const key = getSessionKey(session);
    setSelectedSessionKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const toggleSessionGroupChecked = (
    groupSessions: SessionMeta[],
    checked: boolean,
  ) => {
    const selectableSessions = groupSessions.filter((session) =>
      Boolean(session.sourcePath),
    );
    if (selectableSessions.length === 0) return;

    setSelectedSessionKeys((current) => {
      const next = new Set(current);
      selectableSessions.forEach((session) => {
        const sessionKey = getSessionKey(session);
        if (checked) {
          next.add(sessionKey);
        } else {
          next.delete(sessionKey);
        }
      });
      return next;
    });
  };

  const toggleDirectoryGroup = (directoryKey: string) => {
    setExpandedDirectoryGroups((current) => {
      const next = new Set(current);
      if (next.has(directoryKey)) {
        next.delete(directoryKey);
      } else {
        next.add(directoryKey);
      }
      return next;
    });
  };

  const handleCollapseAllGroups = () => {
    setExpandedDirectoryGroups(new Set());
  };

  const renderSessionItem = (session: SessionMeta) => {
    const sessionKey = getSessionKey(session);
    const isSelected = selectedKey !== null && sessionKey === selectedKey;

    return (
      <SessionItem
        key={sessionKey}
        session={session}
        isSelected={isSelected}
        selectionMode={selectionMode}
        searchQuery={deferredSearch}
        isChecked={selectedSessionKeys.has(sessionKey)}
        isCheckDisabled={!session.sourcePath}
        onSelect={(key) => {
          setSelectedKey(key);
          setCompactDetailOpen(true);
        }}
        onToggleChecked={(checked) => toggleSessionChecked(session, checked)}
      />
    );
  };

  const renderGroupSelectionBadge = (
    selectionState: GroupSelectionState,
    totalCount: number,
    variant: "secondary" | "outline",
  ) => (
    <Badge variant={variant} className="shrink-0 text-xs">
      {selectionMode
        ? `${selectionState.selectedCount}/${selectionState.selectableCount}`
        : totalCount}
    </Badge>
  );

  const renderDirectoryGroupCheckbox = (
    directoryGroup: SessionDirectoryGroup,
    selectionState: GroupSelectionState,
  ) => {
    if (!selectionMode) return null;

    return (
      <Checkbox
        checked={selectionState.checked}
        disabled={selectionState.selectableCount === 0}
        aria-label={t("sessionManager.selectDirectoryGroupForBatch", {
          defaultValue: "选择 {{directory}} 目录分组内会话",
          directory: directoryGroup.label,
        })}
        onClick={(event) => event.stopPropagation()}
        onCheckedChange={() =>
          toggleSessionGroupChecked(
            directoryGroup.sessions,
            !selectionState.isSelected,
          )
        }
      />
    );
  };

  const handleToggleSelectAll = () => {
    setSelectedSessionKeys((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        deletableFilteredSessions.forEach((session) =>
          next.delete(getSessionKey(session)),
        );
      } else {
        deletableFilteredSessions.forEach((session) =>
          next.add(getSessionKey(session)),
        );
      }
      return next;
    });
  };

  const openBatchDeleteDialog = () => {
    if (selectedDeletableSessions.length === 0) return;
    setDeleteTargets(selectedDeletableSessions);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedSessionKeys(new Set());
  };

  return (
    <TooltipProvider>
      <div
        className="session-manager-container session-manager-root mx-auto flex h-full min-h-0 w-full flex-col px-6 py-4"
        data-layout-contract="dual-pane-from-680"
      >
        <ManagementWorkbench
          className={
            compactDetailOpen
              ? "session-manager-workbench session-manager-compact-detail"
              : "session-manager-workbench"
          }
          mode="list"
          toolbar={
            <ResourceToolbar
              className="session-manager-toolbar px-0"
              search={
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("sessionManager.searchMetadataPlaceholder", {
                      defaultValue: "搜索标题、摘要、项目、路径或 ID",
                    })}
                    aria-label={t("sessionManager.searchMetadata", {
                      defaultValue: "搜索会话元数据",
                    })}
                    className="h-8 pl-8 pr-8 text-sm"
                  />
                  {search && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
                      aria-label={t("common.clear", { defaultValue: "清除" })}
                      onClick={() => setSearch("")}
                    >
                      <X className="size-3" />
                    </Button>
                  )}
                </div>
              }
              primaryFilters={
                <>
                  <Select
                    value={sessionProvider}
                    onValueChange={handleSessionProviderChange}
                  >
                    <SelectTrigger
                      className="h-8 w-36"
                      aria-label={t("sessionManager.providerFilterTooltip", {
                        defaultValue: "会话供应商",
                      })}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <ProviderIcon
                          icon={getProviderIconName(sessionProvider)}
                          name={sessionProvider}
                          size={14}
                        />
                        <span className="truncate">
                          {getProviderLabel(sessionProvider, t)}
                        </span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_PROVIDER_IDS.map((providerId) => (
                        <SelectItem key={providerId} value={providerId}>
                          <div className="flex items-center gap-2">
                            <ProviderIcon
                              icon={getProviderIconName(providerId)}
                              name={providerId}
                              size={14}
                            />
                            <span>{getProviderLabel(providerId, t)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(sessionProvider === "codex" ||
                    sessionProvider === "claude") && (
                    <Select
                      value={
                        sessionScope.type === "all"
                          ? ALL_ENVIRONMENTS_VALUE
                          : sessionScope.type === "default"
                            ? DEFAULT_ENVIRONMENT_VALUE
                            : sessionScope.instanceId
                      }
                      onValueChange={(value) => {
                        setSelectedKey(null);
                        setSessionScope(
                          value === ALL_ENVIRONMENTS_VALUE
                            ? { type: "all" }
                            : value === DEFAULT_ENVIRONMENT_VALUE
                              ? { type: "default" }
                              : { type: "instance", instanceId: value },
                        );
                      }}
                    >
                      <SelectTrigger
                        className="h-8 w-40"
                        aria-label={t("sessionManager.environmentFilter", {
                          defaultValue: "运行环境",
                        })}
                      >
                        <span className="truncate">
                          {sessionScope.type === "all"
                            ? t("sessionManager.allEnvironments", {
                                defaultValue: "全部环境",
                              })
                            : sessionScope.type === "default"
                              ? t("sessionManager.defaultEnvironment", {
                                  defaultValue: "默认环境",
                                })
                              : (() => {
                                  const instance = instances.find(
                                    (item) =>
                                      item.id === sessionScope.instanceId,
                                  );
                                  return instance
                                    ? getEnvironmentLabel(instance)
                                    : sessionScope.instanceId;
                                })()}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_ENVIRONMENTS_VALUE}>
                          {t("sessionManager.allEnvironments", {
                            defaultValue: "全部环境",
                          })}
                        </SelectItem>
                        <SelectItem value={DEFAULT_ENVIRONMENT_VALUE}>
                          {t("sessionManager.defaultEnvironment", {
                            defaultValue: "默认环境",
                          })}
                        </SelectItem>
                        {instances.map((instance) => (
                          <SelectItem key={instance.id} value={instance.id}>
                            {getEnvironmentLabel(instance)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </>
              }
              secondaryFilters={
                <Select
                  value={listViewMode}
                  onValueChange={(value) =>
                    setListViewMode(value as SessionListViewMode)
                  }
                >
                  <SelectTrigger
                    className="h-8 w-32"
                    aria-label={t("sessionManager.viewModeTooltip", {
                      defaultValue: "查看方式",
                    })}
                  >
                    <div className="flex items-center gap-2">
                      {listViewMode === "grouped" ? (
                        <ListTree className="size-3.5" />
                      ) : (
                        <List className="size-3.5" />
                      )}
                      <span>{listViewModeLabel}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">
                      {t("sessionManager.viewModeFlat", {
                        defaultValue: "列表",
                      })}
                    </SelectItem>
                    <SelectItem value="grouped">
                      {t("sessionManager.viewModeGrouped", {
                        defaultValue: "按项目",
                      })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              }
              actions={
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={t("common.refresh", {
                          defaultValue: "刷新",
                        })}
                        onClick={() => void refreshSessions()}
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("common.refresh", { defaultValue: "刷新" })}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={selectionMode ? "secondary" : "ghost"}
                        size="icon"
                        className="size-8"
                        aria-label={
                          selectionMode
                            ? t("sessionManager.exitBatchModeTooltip", {
                                defaultValue: "退出批量管理",
                              })
                            : t("sessionManager.manageBatchTooltip", {
                                defaultValue: "批量管理",
                              })
                        }
                        onClick={() => {
                          if (selectionMode) {
                            exitSelectionMode();
                          } else {
                            setSelectionMode(true);
                          }
                        }}
                      >
                        <CheckSquare className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {selectionMode
                        ? t("sessionManager.exitBatchModeTooltip", {
                            defaultValue: "退出批量管理",
                          })
                        : t("sessionManager.manageBatchTooltip", {
                            defaultValue: "批量管理",
                          })}
                    </TooltipContent>
                  </Tooltip>
                </>
              }
            />
          }
        >
          <div
            className="session-manager-layout grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-md border border-border/70 bg-background"
            data-testid="session-master-detail"
            data-layout-contract="responsive-master-detail"
          >
            <div
              className="session-list-container flex min-h-0 flex-1 flex-col overflow-hidden border-r border-border/70 bg-background"
              data-testid="session-master-pane"
              aria-label={t("sessionManager.sessionList", {
                defaultValue: "会话列表",
              })}
            >
              <div className="flex min-h-0 flex-1 flex-col">
                {selectionMode && (
                  <div className="session-batch-bar flex shrink-0 items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {t("sessionManager.selectedCount", {
                        defaultValue: "已选 {{count}} 项",
                        count: selectedDeletableSessions.length,
                      })}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleToggleSelectAll}
                    >
                      {allFilteredSelected
                        ? t("sessionManager.clearFilteredSelection", {
                            defaultValue: "取消全选",
                          })
                        : t("sessionManager.selectAllFiltered", {
                            defaultValue: "全选当前",
                          })}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="ml-auto h-7 gap-1.5 px-2 text-xs"
                      onClick={openBatchDeleteDialog}
                      disabled={
                        isDeleting || selectedDeletableSessions.length === 0
                      }
                    >
                      <Trash2 className="size-3.5" />
                      {isBatchDeleting
                        ? t("sessionManager.batchDeleting", {
                            defaultValue: "删除中...",
                          })
                        : t("sessionManager.deleteSelected", {
                            defaultValue: "批量删除",
                          })}
                    </Button>
                  </div>
                )}
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/70 px-3 text-xs text-muted-foreground">
                  <span>
                    {t("sessionManager.resultCount", {
                      defaultValue: "{{count}} 个会话",
                      count: filteredSessions.length,
                    })}
                  </span>
                  {listViewMode === "grouped" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={t("sessionManager.collapseAllGroups", {
                        defaultValue: "全部收起",
                      })}
                      onClick={handleCollapseAllGroups}
                    >
                      <ChevronsDownUp className="size-3.5" />
                    </Button>
                  )}
                </div>
                <ScrollArea ref={sessionListRootRef} className="min-h-0 flex-1">
                  <div className="p-2">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredSessions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <MessageSquare className="size-8 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {t("sessionManager.noSessions")}
                        </p>
                      </div>
                    ) : listViewMode === "grouped" ? (
                      <div className="space-y-1">
                        {groupedSessions.flatMap((providerGroup) =>
                          providerGroup.directories.map((directoryGroup) => {
                            const directoryOpen = expandedDirectoryGroups.has(
                              directoryGroup.key,
                            );
                            const directorySelectionState =
                              getGroupSelectionState(directoryGroup.sessions);

                            return (
                              <Collapsible
                                key={directoryGroup.key}
                                open={directoryOpen}
                                onOpenChange={() =>
                                  toggleDirectoryGroup(directoryGroup.key)
                                }
                              >
                                <div className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                  {renderDirectoryGroupCheckbox(
                                    directoryGroup,
                                    directorySelectionState,
                                  )}
                                  <CollapsibleTrigger asChild>
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                      aria-label={t(
                                        "sessionManager.toggleDirectoryGroup",
                                        {
                                          defaultValue:
                                            "展开或折叠 {{directory}} 目录分组",
                                          directory: directoryGroup.label,
                                        },
                                      )}
                                    >
                                      {directoryOpen ? (
                                        <ChevronDown className="size-3.5 shrink-0" />
                                      ) : (
                                        <ChevronRight className="size-3.5 shrink-0" />
                                      )}
                                      <FolderOpen className="size-3.5 shrink-0" />
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                            {directoryGroup.label}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="bottom"
                                          className="max-w-xs"
                                        >
                                          <p className="font-mono text-xs break-all">
                                            {directoryGroup.projectDir ??
                                              t(
                                                "sessionManager.unknownDirectory",
                                                {
                                                  defaultValue: "未知目录",
                                                },
                                              )}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                      {renderGroupSelectionBadge(
                                        directorySelectionState,
                                        directoryGroup.sessions.length,
                                        "outline",
                                      )}
                                    </button>
                                  </CollapsibleTrigger>
                                </div>
                                <CollapsibleContent className="mt-1 space-y-1 pl-2">
                                  {directoryGroup.sessions.map((session) =>
                                    renderSessionItem(session),
                                  )}
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          }),
                        )}
                      </div>
                    ) : (
                      <div
                        data-testid="virtualized-session-list"
                        className="relative"
                        style={{
                          height: sessionListVirtualizer.getTotalSize(),
                        }}
                      >
                        {sessionListVirtualizer
                          .getVirtualItems()
                          .map((virtualRow) => (
                            <div
                              key={virtualRow.key}
                              ref={sessionListVirtualizer.measureElement}
                              data-index={virtualRow.index}
                              className="absolute left-0 top-0 w-full pb-1"
                              style={{
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                            >
                              {renderSessionItem(
                                filteredSessions[virtualRow.index],
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div
              className="session-detail-container flex min-h-0 flex-col overflow-hidden bg-background"
              ref={detailRef}
              data-testid="session-detail-pane"
              aria-label={t("sessionManager.sessionDetail", {
                defaultValue: "会话详情",
              })}
            >
              {!selectedSession ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                  <MessageSquare className="size-12 mb-3 opacity-30" />
                  <p className="text-sm">{t("sessionManager.selectSession")}</p>
                </div>
              ) : (
                <>
                  <div className="shrink-0 border-b px-4 py-3">
                    <div className="session-detail-header flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="session-detail-back size-7 shrink-0"
                            aria-label={t("sessionManager.backToList", {
                              defaultValue: "返回会话列表",
                            })}
                            onClick={() => setCompactDetailOpen(false)}
                          >
                            <ArrowLeft className="size-4" />
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="shrink-0">
                                <ProviderIcon
                                  icon={getProviderIconName(
                                    selectedSession.providerId,
                                  )}
                                  name={selectedSession.providerId}
                                  size={20}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {getProviderLabel(selectedSession.providerId, t)}
                            </TooltipContent>
                          </Tooltip>
                          <h2 className="text-base font-semibold truncate">
                            {formatSessionTitle(selectedSession)}
                          </h2>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="size-3" />
                            <span>
                              {formatTimestamp(
                                selectedSession.lastActiveAt ??
                                  selectedSession.createdAt,
                              )}
                            </span>
                          </div>
                          {selectedSession.projectDir && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopy(
                                      selectedSession.projectDir!,
                                      t("sessionManager.projectDirCopied"),
                                    )
                                  }
                                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                                >
                                  <FolderOpen className="size-3" />
                                  <span className="truncate max-w-[200px]">
                                    {getBaseName(selectedSession.projectDir)}
                                  </span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="max-w-xs"
                              >
                                <p className="font-mono text-xs break-all">
                                  {selectedSession.projectDir}
                                </p>
                                <p className="text-muted-foreground mt-1">
                                  {t("sessionManager.clickToCopyPath")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {selectedSession.sourcePath && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopy(
                                      selectedSession.sourcePath!,
                                      t("sessionManager.sourcePathCopied"),
                                    )
                                  }
                                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                                >
                                  <FileText className="size-3 shrink-0" />
                                  <span className="font-mono truncate max-w-[200px]">
                                    {getBaseName(selectedSession.sourcePath)}
                                  </span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="max-w-xs"
                              >
                                <p className="font-mono text-xs break-all">
                                  {selectedSession.sourcePath}
                                </p>
                                <p className="text-muted-foreground mt-1">
                                  {t("sessionManager.clickToCopyPath")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>

                      <div className="session-detail-actions flex items-center gap-2 shrink-0">
                        {selectedSession.resumeCommand &&
                          selectedSession.providerId !== "openclaw" &&
                          selectedSession.providerId !== "hermes" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => void handleResume()}
                                >
                                  <Play className="size-3.5" />
                                  <span className="session-detail-action-label hidden">
                                    {t("sessionManager.resume", {
                                      defaultValue: "恢复会话",
                                    })}
                                  </span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {selectedSession.resumeCommand
                                  ? t("sessionManager.resumeTooltip", {
                                      defaultValue: "在终端中恢复此会话",
                                    })
                                  : t("sessionManager.noResumeCommand", {
                                      defaultValue: "此会话无法恢复",
                                    })}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1.5"
                              onClick={() =>
                                setDeleteTargets([selectedSession])
                              }
                              disabled={
                                !selectedSession.sourcePath || isDeleting
                              }
                            >
                              <Trash2 className="size-3.5" />
                              <span className="session-detail-action-label hidden">
                                {isDeleting
                                  ? t("sessionManager.deleting", {
                                      defaultValue: "删除中...",
                                    })
                                  : t("sessionManager.delete", {
                                      defaultValue: "删除会话",
                                    })}
                              </span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("sessionManager.deleteTooltip", {
                              defaultValue: "永久删除此本地会话记录",
                            })}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    {selectedSession.resumeCommand &&
                      selectedSession.providerId !== "openclaw" &&
                      selectedSession.providerId !== "hermes" && (
                        <div className="mt-3 space-y-2">
                          {selectedSession.instanceId && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge variant="secondary">
                                {t("sessionManager.environmentIdentity", {
                                  environment:
                                    instanceNames.get(
                                      selectedSession.instanceId,
                                    ) ?? selectedSession.instanceId,
                                })}
                              </Badge>
                              <Badge variant="outline">
                                {t("sessionManager.providerIdentity", {
                                  provider:
                                    instanceProviderNames.get(
                                      selectedSession.instanceId,
                                    ) ?? selectedSession.providerId,
                                })}
                              </Badge>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 rounded-md bg-muted/60 px-3 py-1.5 font-mono text-xs text-muted-foreground truncate">
                              {selectedSession.resumeCommand}
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0"
                                  onClick={() =>
                                    void handleCopy(
                                      selectedSession.resumeCommand!,
                                      t("sessionManager.resumeCommandCopied"),
                                    )
                                  }
                                >
                                  <Copy className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("sessionManager.copyCommand", {
                                  defaultValue: "复制命令",
                                })}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {selectedSession.instanceId && (
                            <p className="text-xs leading-5 text-amber-700 dark:text-amber-400">
                              {t("sessionManager.bareCommandWarning")}
                            </p>
                          )}
                        </div>
                      )}
                    {selectedSession.summary && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {selectedSession.summary}
                      </p>
                    )}
                  </div>

                  <div className="min-h-0 flex-1">
                    <div className="flex h-full min-w-0">
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="px-4 pt-4 pb-2 min-w-0">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="size-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {t("sessionManager.conversationHistory", {
                                defaultValue: "对话记录",
                              })}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-xs"
                              data-testid="loaded-message-count"
                            >
                              {messages.length}
                            </Badge>
                          </div>
                        </div>
                        <div
                          ref={scrollContainerRef}
                          className="flex-1 overflow-y-auto px-4 pb-4 min-w-0"
                          role="log"
                          aria-live="polite"
                          aria-relevant="additions text"
                          aria-label={t("sessionManager.conversationHistory", {
                            defaultValue: "对话记录",
                          })}
                        >
                          {isLoadingMessages && messages.length === 0 ? (
                            <div className="flex items-center justify-center py-12">
                              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                            </div>
                          ) : isMessageQueryError && messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                              <p className="text-sm text-destructive">
                                {extractErrorMessage(messageQueryError) ||
                                  t("sessionManager.messageLoadFailed", {
                                    defaultValue: "加载对话记录失败",
                                  })}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void refetchMessages()}
                              >
                                <RefreshCw className="size-3.5" />
                                {t("common.retry", { defaultValue: "重试" })}
                              </Button>
                            </div>
                          ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                              <MessageSquare className="size-8 text-muted-foreground/50 mb-2" />
                              <p className="text-sm text-muted-foreground">
                                {t("sessionManager.emptySession")}
                              </p>
                            </div>
                          ) : (
                            <div
                              style={{
                                height:
                                  messageListHeight + (hasNextPage ? 56 : 0),
                                position: "relative",
                              }}
                            >
                              {messageRows.map((virtualRow) => (
                                <div
                                  key={virtualRow.key}
                                  data-index={virtualRow.index}
                                  ref={virtualizer.measureElement}
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    transform: `translateY(${virtualRow.start}px)`,
                                  }}
                                >
                                  <SessionMessageItem
                                    message={messages[virtualRow.index]}
                                    isActive={
                                      activeMessageIndex === virtualRow.index
                                    }
                                    searchQuery={search}
                                    onCopy={handleMessageCopy}
                                    onLoadFullContent={loadMessageContent}
                                  />
                                </div>
                              ))}
                              {hasNextPage && (
                                <div
                                  ref={messageLoadMoreRef}
                                  className="absolute left-0 right-0 flex justify-center py-3"
                                  style={{ top: messageListHeight }}
                                >
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                  >
                                    {isFetchingNextPage ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : isFetchNextPageError ? (
                                      <RefreshCw className="size-3.5" />
                                    ) : (
                                      <ChevronDown className="size-3.5" />
                                    )}
                                    {isFetchingNextPage
                                      ? t(
                                          "sessionManager.loadingMoreMessages",
                                          { defaultValue: "加载中..." },
                                        )
                                      : isFetchNextPageError
                                        ? t(
                                            "sessionManager.retryMoreMessages",
                                            { defaultValue: "重试加载" },
                                          )
                                        : t("sessionManager.loadMoreMessages", {
                                            defaultValue: "加载更多消息",
                                          })}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <SessionTocSidebar
                        items={userMessagesToc}
                        onItemClick={scrollToMessage}
                      />
                    </div>

                    <SessionTocDialog
                      items={userMessagesToc}
                      onItemClick={scrollToMessage}
                      open={tocDialogOpen}
                      onOpenChange={setTocDialogOpen}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </ManagementWorkbench>
      </div>
      <ConfirmDialog
        isOpen={Boolean(deleteTargets)}
        title={
          deleteTargets && deleteTargets.length > 1
            ? t("sessionManager.batchDeleteConfirmTitle", {
                defaultValue: "批量删除会话",
              })
            : t("sessionManager.deleteConfirmTitle", {
                defaultValue: "删除会话",
              })
        }
        message={
          deleteTargets && deleteTargets.length > 1
            ? t("sessionManager.batchDeleteConfirmMessage", {
                defaultValue:
                  "将永久删除已选中的 {{count}} 个本地会话记录。\n\n此操作不可恢复。",
                count: deleteTargets.length,
              })
            : deleteTargets?.[0]
              ? t("sessionManager.deleteConfirmMessage", {
                  defaultValue:
                    "将永久删除本地会话“{{title}}”\nSession ID: {{sessionId}}\n\n此操作不可恢复。",
                  title: formatSessionTitle(deleteTargets[0]),
                  sessionId: deleteTargets[0].sessionId,
                })
              : ""
        }
        confirmText={
          deleteTargets && deleteTargets.length > 1
            ? t("sessionManager.batchDeleteConfirmAction", {
                defaultValue: "删除所选会话",
              })
            : t("sessionManager.deleteConfirmAction", {
                defaultValue: "删除会话",
              })
        }
        cancelText={t("common.cancel", { defaultValue: "取消" })}
        variant="destructive"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => {
          if (!isDeleting) {
            setDeleteTargets(null);
          }
        }}
      />
    </TooltipProvider>
  );
}
