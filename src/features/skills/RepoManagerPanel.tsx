import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Trash2, ExternalLink, Loader2, Plus } from "lucide-react";
import { settingsApi } from "@/platform/tauri/api";
import { FullScreenPanel } from "@/shared/common/FullScreenPanel";
import type { DiscoverableSkill, SkillRepo } from "@/platform/tauri/api/skills";
import { formatSkillError } from "@/lib/errors/skillErrorParser";

export interface RepoManagerPanelProps {
  repos: SkillRepo[];
  skills: DiscoverableSkill[];
  onAdd: (repo: SkillRepo) => Promise<void>;
  isAdding: boolean;
  onRemove: (owner: string, name: string) => Promise<void>;
  onClose: () => void;
}

export function parseSkillRepoUrl(
  url: string,
): { owner: string; name: string } | null {
  let cleaned = url.trim();
  cleaned = cleaned.replace(/^https?:\/\/github\.com\//, "");
  cleaned = cleaned.replace(/\.git$/, "");
  const parts = cleaned.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], name: parts[1] };
  }
  return null;
}

export function RepoManagerPanel({
  repos,
  skills,
  onAdd,
  isAdding,
  onRemove,
  onClose,
}: RepoManagerPanelProps) {
  const { t } = useTranslation();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");

  const getSkillCount = (repo: SkillRepo) =>
    skills.filter(
      (skill) =>
        skill.repoOwner === repo.owner &&
        skill.repoName === repo.name &&
        skill.repoBranch === repo.branch,
    ).length;

  const parseRepoUrl = parseSkillRepoUrl;

  const handleAdd = async () => {
    setError("");

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      setError(t("skills.repo.invalidUrl"));
      return;
    }

    try {
      await onAdd({
        owner: parsed.owner,
        name: parsed.name,
        branch,
        enabled: true,
      });

      setRepoUrl("");
      setBranch("");
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      const { description } = formatSkillError(
        errorMessage,
        t,
        "skills.repo.addFailed",
      );
      setError(description);
    }
  };

  const handleOpenRepo = async (owner: string, name: string) => {
    try {
      await settingsApi.openExternal(`https://github.com/${owner}/${name}`);
    } catch (error) {
      console.error("Failed to open URL:", error);
    }
  };

  return (
    <FullScreenPanel
      isOpen={true}
      title={t("skills.repo.title")}
      onClose={onClose}
    >
      <div className="space-y-4 rounded-md border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground">
          {t("skills.addRepo")}
        </h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="repo-url" className="text-foreground">
              {t("skills.repo.url")}
            </Label>
            <Input
              id="repo-url"
              placeholder={t("skills.repo.urlPlaceholder")}
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={isAdding}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="branch" className="text-foreground">
              {t("skills.repo.branch")}
            </Label>
            <Input
              id="branch"
              placeholder={t("skills.repo.branchPlaceholder")}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={isAdding}
              className="mt-2"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={handleAdd}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            type="button"
            disabled={isAdding}
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {t("skills.repo.add")}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-base font-semibold text-foreground">
          {t("skills.repo.list")}
        </h3>
        {repos.length === 0 ? (
          <div className="border border-dashed border-border bg-card/45 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {t("skills.repo.empty")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {repos.map((repo) => (
              <div
                key={`${repo.owner}/${repo.name}`}
                className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {repo.owner}/{repo.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("skills.repo.branch")}:{" "}
                    {repo.branch || t("skills.repo.defaultBranch")}
                    <span className="ml-3 inline-flex items-center rounded-full border border-border-default px-2 py-0.5 text-[11px]">
                      {t("skills.repo.skillCount", {
                        count: getSkillCount(repo),
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => handleOpenRepo(repo.owner, repo.name)}
                    title={t("common.view", { defaultValue: "查看" })}
                    className="hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => onRemove(repo.owner, repo.name)}
                    title={t("common.delete")}
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FullScreenPanel>
  );
}
