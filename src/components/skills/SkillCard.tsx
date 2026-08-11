import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Download,
  Trash2,
  Loader2,
  GitBranch,
  Folder,
} from "lucide-react";
import { settingsApi } from "@/lib/api";
import type { DiscoverableSkill } from "@/lib/api/skills";
import { StatusBadge } from "@/components/common/ManagementWorkbench";

type SkillCardSkill = DiscoverableSkill & { installed: boolean };

interface SkillCardProps {
  skill: SkillCardSkill;
  onInstall: (key: string) => Promise<void>;
  onUninstall: (key: string) => Promise<void>;
  installs?: number;
}

export function SkillCard({
  skill,
  onInstall,
  onUninstall,
  installs,
}: SkillCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleInstall = async () => {
    setLoading(true);
    try {
      await onInstall(skill.key);
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async () => {
    setLoading(true);
    try {
      await onUninstall(skill.key);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenGithub = async () => {
    if (skill.readmeUrl) {
      try {
        await settingsApi.openExternal(skill.readmeUrl);
      } catch (error) {
        console.error("Failed to open URL:", error);
      }
    }
  };

  const showDirectory =
    Boolean(skill.directory) &&
    skill.directory.trim().toLowerCase() !== skill.name.trim().toLowerCase();

  return (
    <div
      data-skill-key={skill.key}
      className="skill-discovery-card group flex min-h-[180px] min-w-0 flex-col border border-border bg-card p-4 transition-colors hover:border-border/90 hover:bg-muted/25"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">
            {skill.name}
          </h3>
          {skill.repoOwner && skill.repoName && (
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {skill.repoOwner}/{skill.repoName}
              </span>
              {skill.repoBranch && (
                <span className="shrink-0 text-muted-foreground/70">
                  · {skill.repoBranch}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {typeof installs === "number" && (
            <StatusBadge status="muted" className="h-5 px-1.5">
              <Download className="mr-0.5 h-2.5 w-2.5" />
              {installs.toLocaleString()}
            </StatusBadge>
          )}
          {skill.installed && (
            <StatusBadge status="success" className="h-5 px-1.5">
              {t("skills.installed")}
            </StatusBadge>
          )}
        </div>
      </div>

      <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-muted-foreground">
        {skill.description || t("skills.noDescription")}
      </p>

      <div className="mt-auto flex min-w-0 items-end justify-between gap-3 border-t border-border/70 pt-3">
        <div className="min-w-0">
          {showDirectory && (
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate" title={skill.directory}>
                {skill.directory}
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {skill.readmeUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={handleOpenGithub}
              disabled={loading}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {t("skills.view")}
            </Button>
          )}
          {skill.installed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUninstall}
              disabled={loading}
              className="h-8 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {loading ? t("skills.uninstalling") : t("skills.uninstall")}
            </Button>
          ) : (
            <Button
              variant="mcp"
              size="sm"
              onClick={handleInstall}
              disabled={loading || !skill.repoOwner}
              className="h-8"
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              {loading ? t("skills.installing") : t("skills.install")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
