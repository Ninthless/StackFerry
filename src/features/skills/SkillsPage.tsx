import {
  useState,
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  RefreshCw,
  Search,
  Loader2,
  Settings,
  GitFork,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { SkillCard } from "./SkillCard";
import { RepoManagerPanel } from "./RepoManagerPanel";
import {
  useDiscoverableSkills,
  useInstalledSkills,
  useInstallSkill,
  useSkillRepos,
  useAddSkillRepo,
  useRemoveSkillRepo,
  useSearchSkillsSh,
} from "@/features/skills";
import type { AppId } from "@/platform/tauri/api/types";
import type {
  DiscoverableSkill,
  SkillRepo,
  SkillsShDiscoverableSkill,
} from "@/platform/tauri/api/skills";
import { formatSkillError } from "@/lib/errors/skillErrorParser";
import { SkillTargetAppDialog } from "./SkillTargetAppDialog";

export type SkillsPageSource = "repos" | "skillssh";

interface SkillsPageProps {
  availableApps: readonly AppId[];
  onSourceChange?: (source: SkillsPageSource) => void;
  workbenchTabs?: ReactNode;
}

export interface SkillsPageHandle {
  refresh: () => void;
  openRepoManager: () => void;
}

type SkillsPageHeaderAction = {
  key: string;
  sources: readonly SkillsPageSource[];
  labelKey: string;
  Icon: LucideIcon;
  execute: (page: SkillsPageHandle | null) => void;
};

const SKILLS_PAGE_HEADER_ACTIONS: readonly SkillsPageHeaderAction[] = [
  {
    key: "refresh-repos",
    sources: ["repos"],
    labelKey: "skills.refresh",
    Icon: RefreshCw,
    execute: (page) => page?.refresh(),
  },
  {
    key: "manage-repos",
    sources: ["repos", "skillssh"],
    labelKey: "skills.repoManager",
    Icon: Settings,
    execute: (page) => page?.openRepoManager(),
  },
];

export const getSkillsPageHeaderActions = (source: SkillsPageSource) =>
  SKILLS_PAGE_HEADER_ACTIONS.filter((action) =>
    action.sources.includes(source),
  );

const SKILLSSH_PAGE_SIZE = 20;

/**
 * Skills 发现面板
 * 用于浏览和安装来自仓库或 skills.sh 的 Skills
 */
export const SkillsPage = forwardRef<SkillsPageHandle, SkillsPageProps>(
  ({ availableApps, onSourceChange, workbenchTabs }, ref) => {
    const { t } = useTranslation();
    const [repoManagerOpen, setRepoManagerOpen] = useState(false);
    const [pendingInstallSkill, setPendingInstallSkill] =
      useState<DiscoverableSkill | null>(null);
    const [installTargetApp, setInstallTargetApp] = useState<AppId>(
      () => availableApps[0] ?? "claude",
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [filterRepo, setFilterRepo] = useState<string>("all");
    const [filterStatus, setFilterStatus] = useState<
      "all" | "installed" | "uninstalled"
    >("all");

    // skills.sh 搜索状态
    const [searchSource, setSearchSource] = useState<SkillsPageSource>("repos");
    const [skillsShInput, setSkillsShInput] = useState("");
    const [skillsShQuery, setSkillsShQuery] = useState("");
    const [skillsShOffset, setSkillsShOffset] = useState(0);
    const [accumulatedResults, setAccumulatedResults] = useState<
      SkillsShDiscoverableSkill[]
    >([]);

    useEffect(() => {
      if (!availableApps.includes(installTargetApp)) {
        setInstallTargetApp(availableApps[0] ?? "claude");
      }
    }, [availableApps, installTargetApp]);

    // Queries
    const {
      data: discoveryResult,
      isLoading: loadingDiscoverable,
      isFetching: fetchingDiscoverable,
      refetch: refetchDiscoverable,
    } = useDiscoverableSkills();
    const discoverableSkills = discoveryResult?.skills;
    const discoveryFailures = discoveryResult?.failures ?? [];
    const { data: installedSkills } = useInstalledSkills();
    const { data: repos = [], refetch: refetchRepos } = useSkillRepos();

    // skills.sh 搜索
    const {
      data: skillsShResult,
      isLoading: loadingSkillsSh,
      isFetching: fetchingSkillsSh,
      isPlaceholderData: placeholderSkillsSh,
    } = useSearchSkillsSh(skillsShQuery, SKILLSSH_PAGE_SIZE, skillsShOffset);

    // 当搜索结果返回时累积
    useEffect(() => {
      if (skillsShResult && !placeholderSkillsSh) {
        if (skillsShOffset === 0) {
          setAccumulatedResults(skillsShResult.skills);
        } else {
          setAccumulatedResults((prev) => [...prev, ...skillsShResult.skills]);
        }
      }
    }, [skillsShResult, skillsShOffset, placeholderSkillsSh]);

    // 手动提交搜索
    const handleSkillsShSearch = () => {
      const trimmed = skillsShInput.trim();
      if (trimmed.length < 2) return;
      if (trimmed === skillsShQuery && skillsShOffset === 0) return;
      setSkillsShOffset(0);
      setAccumulatedResults([]);
      setSkillsShQuery(trimmed);
    };

    // Mutations
    const installMutation = useInstallSkill();
    const addRepoMutation = useAddSkillRepo();
    const removeRepoMutation = useRemoveSkillRepo();

    // 已安装的 skill key 集合（使用 directory + repoOwner + repoName 组合判断）
    const installedKeys = useMemo(() => {
      if (!installedSkills) return new Set<string>();
      return new Set(
        installedSkills.map((s) => {
          // 构建唯一 key：directory + repoOwner + repoName
          const owner = s.repoOwner?.toLowerCase() || "";
          const name = s.repoName?.toLowerCase() || "";
          return `${s.directory.toLowerCase()}:${owner}:${name}`;
        }),
      );
    }, [installedSkills]);

    type DiscoverableSkillItem = DiscoverableSkill & { installed: boolean };

    // 从可发现技能中提取所有仓库选项
    const repoOptions = useMemo(() => {
      if (!discoverableSkills) return [];
      const repoSet = new Set<string>();
      discoverableSkills.forEach((s) => {
        if (s.repoOwner && s.repoName) {
          repoSet.add(`${s.repoOwner}/${s.repoName}`);
        }
      });
      return Array.from(repoSet).sort();
    }, [discoverableSkills]);

    // 为发现列表补齐 installed 状态，供 SkillCard 使用
    const skills: DiscoverableSkillItem[] = useMemo(() => {
      if (!discoverableSkills) return [];
      return discoverableSkills.map((d) => {
        // 同时处理 / 和 \ 路径分隔符（兼容 Windows 和 Unix）
        const installName =
          d.directory.split(/[/\\]/).pop()?.toLowerCase() ||
          d.directory.toLowerCase();
        // 使用 directory + repoOwner + repoName 组合判断是否已安装
        const key = `${installName}:${d.repoOwner.toLowerCase()}:${d.repoName.toLowerCase()}`;
        return {
          ...d,
          installed: installedKeys.has(key),
        };
      });
    }, [discoverableSkills, installedKeys]);

    // 检查 skills.sh 结果的安装状态
    const isSkillsShInstalled = (skill: SkillsShDiscoverableSkill): boolean => {
      const key = `${skill.directory.toLowerCase()}:${skill.repoOwner.toLowerCase()}:${skill.repoName.toLowerCase()}`;
      return installedKeys.has(key);
    };

    const loading =
      searchSource === "repos" && loadingDiscoverable && !discoveryResult;

    useImperativeHandle(ref, () => ({
      refresh: () => {
        refetchDiscoverable();
        refetchRepos();
      },
      openRepoManager: () => setRepoManagerOpen(true),
    }));

    // skills.sh 结果转为 DiscoverableSkill（复用现有安装流程）
    const toDiscoverableSkill = (
      s: SkillsShDiscoverableSkill,
    ): DiscoverableSkill => ({
      key: s.key,
      name: s.name,
      description: "",
      directory: s.directory,
      repoOwner: s.repoOwner,
      repoName: s.repoName,
      repoBranch: s.repoBranch,
      readmeUrl: s.readmeUrl,
    });

    const handleInstall = async (key: string) => {
      let skill: DiscoverableSkill | undefined;

      if (searchSource === "skillssh") {
        const found = accumulatedResults.find((s) => s.key === key);
        if (found) {
          skill = toDiscoverableSkill(found);
        }
      } else {
        skill = discoverableSkills?.find((s) => s.key === key);
      }

      if (!skill) {
        toast.error(t("skills.notFound"));
        return;
      }

      setPendingInstallSkill(skill);
    };

    const handleConfirmInstall = async () => {
      if (!pendingInstallSkill) return;
      try {
        await installMutation.mutateAsync({
          skill: pendingInstallSkill,
          currentApp: installTargetApp,
        });
        toast.success(
          t("skills.installSuccess", { name: pendingInstallSkill.name }),
          { closeButton: true },
        );
        setPendingInstallSkill(null);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const { title, description } = formatSkillError(
          errorMessage,
          t,
          "skills.installFailed",
        );
        toast.error(title, {
          description,
          duration: 10000,
        });
        console.error("Install skill failed:", error);
      }
    };

    const handleUninstall = async (_directory: string) => {
      // 在发现面板中，不支持卸载，需要在主面板中操作
      toast.info(t("skills.uninstallInMainPanel"));
    };

    const handleAddRepo = async (repo: SkillRepo) => {
      try {
        const result = await addRepoMutation.mutateAsync(repo);
        toast.success(
          t("skills.repo.addSuccess", {
            owner: result.repo.owner,
            name: result.repo.name,
            count: result.skillCount,
          }),
          { closeButton: true },
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const { title, description } = formatSkillError(
          errorMessage,
          t,
          "skills.repo.addFailed",
        );
        toast.error(title, { description });
        throw error;
      }
    };

    const handleRemoveRepo = async (owner: string, name: string) => {
      try {
        await removeRepoMutation.mutateAsync({ owner, name });
        toast.success(t("skills.repo.removeSuccess", { owner, name }), {
          closeButton: true,
        });
      } catch (error) {
        toast.error(t("common.error"), {
          description: String(error),
        });
      }
    };

    // 过滤技能列表（仓库模式）
    const filteredSkills = useMemo(() => {
      // 按仓库筛选
      const byRepo = skills.filter((skill) => {
        if (filterRepo === "all") return true;
        const skillRepo = `${skill.repoOwner}/${skill.repoName}`;
        return skillRepo === filterRepo;
      });

      // 按安装状态筛选
      const byStatus = byRepo.filter((skill) => {
        if (filterStatus === "installed") return skill.installed;
        if (filterStatus === "uninstalled") return !skill.installed;
        return true;
      });

      // 按搜索关键词筛选
      if (!searchQuery.trim()) return byStatus;

      const query = searchQuery.toLowerCase();
      return byStatus.filter((skill) => {
        const name = skill.name?.toLowerCase() || "";
        const repo =
          skill.repoOwner && skill.repoName
            ? `${skill.repoOwner}/${skill.repoName}`.toLowerCase()
            : "";

        return name.includes(query) || repo.includes(query);
      });
    }, [skills, searchQuery, filterRepo, filterStatus]);

    // 是否有更多 skills.sh 结果
    const hasMoreSkillsSh =
      skillsShResult && accumulatedResults.length < skillsShResult.totalCount;
    const searchingSkillsSh =
      (loadingSkillsSh || fetchingSkillsSh) && accumulatedResults.length === 0;

    // 无仓库配置时默认切换到 skills.sh；仓库发现结果为空时仍保留仓库视图，方便手动刷新重试。
    const effectiveSource =
      searchSource === "repos" && repos.length === 0 && !loading
        ? "skillssh"
        : searchSource;

    useEffect(() => {
      onSourceChange?.(effectiveSource);
    }, [effectiveSource, onSourceChange]);

    return (
      <div className="skills-discovery flex min-h-0 flex-1 flex-col overflow-hidden bg-background/50 px-6">
        {workbenchTabs && (
          <div className="flex min-h-10 shrink-0 items-center justify-end border-b border-border/70 py-1.5">
            {workbenchTabs}
          </div>
        )}
        {/* 技能网格（可滚动详情区域） */}
        <div className="flex min-h-0 flex-1 flex-col animate-fade-in">
          <div className="shrink-0 py-4">
            {/* 搜索来源切换 + 搜索框 */}
            <div className="skills-discovery-toolbar flex flex-col gap-3">
              {/* 来源切换 */}
              <div className="skills-discovery-source inline-flex shrink-0 gap-1 rounded-md border border-border-default bg-background p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={effectiveSource === "repos" ? "default" : "ghost"}
                  className={
                    effectiveSource === "repos"
                      ? "shadow-sm min-w-[64px]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted min-w-[64px]"
                  }
                  onClick={() => setSearchSource("repos")}
                >
                  {t("skills.searchSource.repos")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={effectiveSource === "skillssh" ? "default" : "ghost"}
                  className={
                    effectiveSource === "skillssh"
                      ? "shadow-sm min-w-[80px]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted min-w-[80px]"
                  }
                  onClick={() => setSearchSource("skillssh")}
                >
                  skills.sh
                </Button>
              </div>

              {effectiveSource === "repos" ? (
                <>
                  {/* 仓库模式搜索框 */}
                  <div className="skills-discovery-search relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t("skills.searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-3"
                    />
                  </div>
                  {/* 仓库筛选 */}
                  <div className="skills-discovery-repo-filter min-w-0">
                    <Select value={filterRepo} onValueChange={setFilterRepo}>
                      <SelectTrigger className="bg-card border shadow-sm text-foreground">
                        <SelectValue
                          placeholder={t("skills.filter.repo")}
                          className="text-left truncate"
                        />
                      </SelectTrigger>
                      <SelectContent className="bg-card text-foreground shadow-lg max-h-64 min-w-[var(--radix-select-trigger-width)]">
                        <SelectItem
                          value="all"
                          className="text-left pr-3 [&[data-state=checked]>span:first-child]:hidden"
                        >
                          {t("skills.filter.allRepos")}
                        </SelectItem>
                        {repoOptions.map((repo) => (
                          <SelectItem
                            key={repo}
                            value={repo}
                            className="text-left pr-3 [&[data-state=checked]>span:first-child]:hidden"
                            title={repo}
                          >
                            <span className="truncate block max-w-[200px]">
                              {repo}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* 安装状态筛选 */}
                  <div className="skills-discovery-status-filter min-w-0">
                    <Select
                      value={filterStatus}
                      onValueChange={(val) =>
                        setFilterStatus(
                          val as "all" | "installed" | "uninstalled",
                        )
                      }
                    >
                      <SelectTrigger className="bg-card border shadow-sm text-foreground">
                        <SelectValue
                          placeholder={t("skills.filter.placeholder")}
                          className="text-left"
                        />
                      </SelectTrigger>
                      <SelectContent className="bg-card text-foreground shadow-lg">
                        <SelectItem
                          value="all"
                          className="text-left pr-3 [&[data-state=checked]>span:first-child]:hidden"
                        >
                          {t("skills.filter.all")}
                        </SelectItem>
                        <SelectItem
                          value="installed"
                          className="text-left pr-3 [&[data-state=checked]>span:first-child]:hidden"
                        >
                          {t("skills.filter.installed")}
                        </SelectItem>
                        <SelectItem
                          value="uninstalled"
                          className="text-left pr-3 [&[data-state=checked]>span:first-child]:hidden"
                        >
                          {t("skills.filter.uninstalled")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {searchQuery && (
                    <p className="skills-discovery-count text-sm text-muted-foreground">
                      {t("skills.count", { count: filteredSkills.length })}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {/* skills.sh 搜索框 */}
                  <div className="skills-discovery-search relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t("skills.skillssh.searchPlaceholder")}
                      value={skillsShInput}
                      onChange={(e) => setSkillsShInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSkillsShSearch();
                      }}
                      className="pl-9 pr-3"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSkillsShSearch}
                    disabled={
                      skillsShInput.trim().length < 2 || fetchingSkillsSh
                    }
                    className="skills-discovery-search-action shrink-0"
                  >
                    {fetchingSkillsSh ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {t("skills.search")}
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="skills-discovery-repo-action shrink-0"
                onClick={() => setRepoManagerOpen(true)}
              >
                <GitFork className="mr-1.5 h-4 w-4" />
                {t("skills.repoManager")}
                <span className="ml-1 text-xs text-muted-foreground">
                  {repos.length}
                </span>
              </Button>
            </div>

            {/* 内容区域 */}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-6">
            {effectiveSource === "repos" && discoveryFailures.length > 0 && (
              <div className="mb-4 shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {t("skills.discoveryFailures.title", {
                        count: discoveryFailures.length,
                      })}
                    </p>
                    <div className="mt-1 space-y-1 text-xs opacity-90">
                      {discoveryFailures.map((failure) => (
                        <p
                          key={`${failure.owner}/${failure.name}:${failure.branch}`}
                        >
                          {t("skills.discoveryFailures.item", {
                            repo: `${failure.owner}/${failure.name}`,
                            branch:
                              failure.branch || t("skills.repo.defaultBranch"),
                            error: failure.error,
                          })}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {effectiveSource === "repos" &&
              fetchingDiscoverable &&
              !loading && (
                <div className="mb-3 flex shrink-0 items-center justify-end gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("skills.refreshing")}
                </div>
              )}
            {effectiveSource === "repos" ? (
              /* ===== 仓库模式 ===== */
              loading ? (
                <div className="flex flex-1 items-center justify-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : skills.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <p className="text-lg font-medium text-foreground">
                    {t("skills.empty")}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("skills.emptyDescription")}
                  </p>
                  <Button
                    variant="link"
                    onClick={() => setRepoManagerOpen(true)}
                    className="mt-3 text-sm font-normal"
                  >
                    {t("skills.addRepo")}
                  </Button>
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <p className="text-lg font-medium text-foreground">
                    {t("skills.noResults")}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("skills.emptyDescription")}
                  </p>
                </div>
              ) : (
                <div className="skills-discovery-grid grid grid-cols-1 gap-4">
                  {filteredSkills.map((skill) => (
                    <SkillCard
                      key={skill.key}
                      skill={skill}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                    />
                  ))}
                </div>
              )
            ) : (
              /* ===== skills.sh 模式 ===== */
              <>
                {searchingSkillsSh ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-sm text-muted-foreground">
                      {t("skills.skillssh.loading")}
                    </span>
                  </div>
                ) : skillsShQuery.length < 2 ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-sm text-muted-foreground">
                      {t("skills.skillssh.searchPlaceholder")}
                    </p>
                  </div>
                ) : accumulatedResults.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <p className="text-lg font-medium text-foreground">
                      {t("skills.skillssh.noResults", {
                        query: skillsShQuery,
                      })}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="skills-discovery-grid grid grid-cols-1 gap-4">
                      {accumulatedResults.map((skill) => {
                        const installed = isSkillsShInstalled(skill);
                        return (
                          <SkillCard
                            key={skill.key}
                            skill={{
                              ...toDiscoverableSkill(skill),
                              installed,
                            }}
                            installs={skill.installs}
                            onInstall={handleInstall}
                            onUninstall={handleUninstall}
                          />
                        );
                      })}
                    </div>

                    {/* 加载更多 + 底部信息 */}
                    <div className="mt-6 flex flex-col items-center gap-2">
                      {hasMoreSkillsSh && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={fetchingSkillsSh}
                          onClick={() =>
                            setSkillsShOffset(
                              (prev) => prev + SKILLSSH_PAGE_SIZE,
                            )
                          }
                        >
                          {fetchingSkillsSh ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : null}
                          {t("skills.skillssh.loadMore")}
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t("skills.skillssh.poweredBy")}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* 仓库管理面板 */}
        {repoManagerOpen && (
          <RepoManagerPanel
            repos={repos}
            skills={skills}
            onAdd={handleAddRepo}
            isAdding={addRepoMutation.isPending}
            onRemove={handleRemoveRepo}
            onClose={() => setRepoManagerOpen(false)}
          />
        )}

        <SkillTargetAppDialog
          open={Boolean(pendingInstallSkill)}
          appIds={availableApps}
          value={installTargetApp}
          title={pendingInstallSkill?.name ?? t("skills.install")}
          description={t("skills.installTargetDescription")}
          confirmLabel={t("skills.install")}
          isPending={installMutation.isPending}
          onValueChange={setInstallTargetApp}
          onConfirm={() => void handleConfirmInstall()}
          onClose={() => setPendingInstallSkill(null)}
        />
      </div>
    );
  },
);

SkillsPage.displayName = "SkillsPage";
