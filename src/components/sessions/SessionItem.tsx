import { Clock, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/ProviderIcon";
import type { SessionMeta } from "@/types";
import {
  formatRelativeTime,
  formatSessionTitle,
  getProviderIconName,
  getProviderLabel,
  getSessionKey,
  highlightText,
} from "./utils";

interface SessionItemProps {
  session: SessionMeta;
  isSelected: boolean;
  selectionMode: boolean;
  isChecked: boolean;
  isCheckDisabled?: boolean;
  searchQuery?: string;
  onSelect: (key: string) => void;
  onToggleChecked: (checked: boolean) => void;
}

export function SessionItem({
  session,
  isSelected,
  selectionMode,
  isChecked,
  isCheckDisabled = false,
  searchQuery,
  onSelect,
  onToggleChecked,
}: SessionItemProps) {
  const { t } = useTranslation();
  const title = formatSessionTitle(session);
  const lastActive = session.lastActiveAt || session.createdAt || undefined;
  const sessionKey = getSessionKey(session);

  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded px-2.5 py-2 transition-colors",
        isSelected
          ? "bg-muted text-foreground"
          : "text-foreground hover:bg-muted/60",
      )}
    >
      {selectionMode && (
        <div className="shrink-0 pt-0.5">
          <Checkbox
            checked={isChecked}
            disabled={isCheckDisabled}
            aria-label={t("sessionManager.selectForBatch", {
              defaultValue: "选择会话",
            })}
            onCheckedChange={(checked) => onToggleChecked(Boolean(checked))}
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => onSelect(sessionKey)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="mb-1 flex items-start gap-2">
          <span className="text-sm font-medium line-clamp-2 flex-1">
            {searchQuery ? highlightText(title, searchQuery) : title}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="mt-0.5 shrink-0">
                <ProviderIcon
                  icon={getProviderIconName(session.providerId)}
                  name={session.providerId}
                  size={14}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {getProviderLabel(session.providerId, t)}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            <FolderOpen className="size-3 shrink-0" />
            <span className="truncate">
              {session.projectDir
                ? session.projectDir.split(/[\\/]/).filter(Boolean).pop()
                : t("sessionManager.unknownDirectory")}
            </span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <Clock className="size-3" />
            <span>
              {lastActive
                ? formatRelativeTime(lastActive, t)
                : t("common.unknown")}
            </span>
          </span>
        </div>
      </button>
    </div>
  );
}
